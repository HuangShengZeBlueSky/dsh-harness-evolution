"""Apply an explicit measured result to the paper table."""
import argparse
import datetime
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--record", type=Path, required=True)
args = parser.parse_args()
record = json.loads(args.record.read_text())
for key in ("row", "column", "mean", "checkpoint", "artifact", "evaluation", "source"):
    if key not in record:
        raise ValueError("Missing measured-record field: " + key)
table_path = ROOT / "paper/data/main-results.json"
table = json.loads(table_path.read_text())
row = next(r for r in table["rows"] if r["method"] == record["row"])
if record["column"] not in table["columns"]:
    raise ValueError("Choose an existing benchmark condition")
if not (ROOT / record["artifact"] / "composition.json").is_file():
    raise ValueError("Publish the corresponding harness artifact first")
path = ROOT / "paper/data/publication-history.json"
history = json.loads(path.read_text()) if path.exists() else []
history.append({"previous": row["scores"][record["column"]], "record": record})
row["scores"][record["column"]] = {"mean": record["mean"], "sd": record.get("sd"),
                                  "checkpoint": record["checkpoint"], "artifact": record["artifact"]}
table["updated"] = datetime.date.today().isoformat()
path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n")
table_path.write_text(json.dumps(table, ensure_ascii=False, indent=2) + "\n")
print("Updated", record["row"], record["column"], "to", record["mean"])
