"""Build the paper leaderboard and static reader from versioned data."""
import html
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "paper/data"
SITE = ROOT / "site"
REPO = "https://github.com/HuangShengZeBlueSky/dsh-harness-evolution"
labels = {"alfworld": "ALFWorld", "dbbench": "DBBench", "webshop_historical": "WebShop · historical",
          "webshop_frozen": "WebShop · frozen", "osbench": "OSBench", "telecom": "Telecom"}


def score(value):
    if value is None:
        return "—"
    text = f'{value["mean"]:.2f}'
    return text + (f' ± {value["sd"]:.2f}' if value.get("sd") is not None else "")


def main():
    SITE.mkdir(exist_ok=True)
    data = json.loads((DATA / "main-results.json").read_text())
    manifest = json.loads((ROOT / "paper/figures.json").read_text())
    header = ["Method"] + [labels[c] for c in data["columns"]]
    lines = ["# Test leaderboard", "", "Values follow the paper snapshot dated " + data["updated"] + ".", "",
             "| " + " | ".join(header) + " |", "|" + "|".join(["---"] * len(header)) + "|"]
    for row in data["rows"]:
        lines.append("| " + " | ".join([row["method"]] + [score(row["scores"][c]) for c in data["columns"]]) + " |")
    lines += ["", "All values are test success percentages. ± denotes sample standard deviation across repeated executions.",
              "Historical and frozen WebShop catalogs are separate conditions. Local Telecom uses GLM.",
              "OSBench's historical 39.35% and the 41.67% data-control artifact have separate provenance.",
              "", "[Configurations](docs/REPRODUCING.md) · [Figures and source data](paper/README.md)",
              "", "## Released harnesses", ""]
    artifacts=[]
    for p in sorted((ROOT / "harnesses").glob("*/*/composition.json")):
        folder=p.parent
        artifacts.append({"benchmark":folder.parent.name,"path":str(folder.relative_to(ROOT)),"name":folder.name})
        lines.append(f'- [{folder.parent.name} · {folder.name}]({folder.relative_to(ROOT)})')
    peak, selected = data["rows"][:2]
    for filename, chinese in (("README.md", False), ("README.zh-CN.md", True)):
        path = ROOT / filename
        headings = ["场景", "历史产物已测高点", "历史最终选版"] if chinese else ["Benchmark", "Historical measured peak", "Historical final-selected"]
        summary = ["| " + " | ".join(headings) + " |", "|---|---:|---:|"]
        for column in data["columns"]:
            values = [row["scores"][column] for row in (peak, selected)]
            summary.append("| " + " | ".join([labels[column]] + [f'{x["mean"]:.2f}%' if x else "—" for x in values]) + " |")
        replacement = "<!-- paper-table:start -->\n" + "\n".join(summary) + "\n<!-- paper-table:end -->"
        path.write_text(re.sub(r"<!-- paper-table:start -->.*?<!-- paper-table:end -->", lambda match: replacement, path.read_text(), flags=re.S))
    text="\n".join(lines)+"\n"
    (ROOT / "LEADERBOARD.md").write_text(text)
    (ROOT / "paper/tables/main-results.md").write_text(text.replace("](docs/", "](" + REPO + "/blob/main/docs/").replace("](paper/", "](" + REPO + "/tree/main/paper/").replace("](harnesses/", "](" + REPO + "/tree/main/harnesses/"))
    (ROOT / "LEADERBOARD.zh-CN.md").write_text(text.replace("# Test leaderboard","# 测试榜单")
        .replace("Values follow the paper snapshot dated ","数据对齐论文快照日期 ")
        .replace("## Released harnesses","## 已发布 Harness"))
    (ROOT / "results/leaderboard.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n")
    payload={"leaderboard":data,"figures":manifest,"artifacts":artifacts,
             "configs":json.loads((ROOT/"configs/index.json").read_text()),
             "controlled":[{"benchmark":x["benchmark"],"arm":x["arm"],"final":x["final"]}
                for x in json.loads((DATA/"controlled-abc.json").read_text())]}
    template=(ROOT / "tools/site.html").read_text()
    (SITE/"index.html").write_text(template.replace("__DATA__",json.dumps(payload,ensure_ascii=False).replace("</","<\\/")))
    shutil.copytree(ROOT/"paper",SITE/"paper",dirs_exist_ok=True)
    for legacy in ("architecture.html","research.html","pilot.html"):
        (SITE/legacy).write_text('<!doctype html><meta http-equiv="refresh" content="0;url=./#method"><a href="./">DSH Harness Evolution</a>')
    print("Built leaderboard,",len(manifest),"figures,",len(artifacts),"artifacts")


if __name__ == "__main__":
    main()
