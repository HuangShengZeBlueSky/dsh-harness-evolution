"""Host-controlled, resumable 40-candidate search and promoted-checkpoint tests."""
from contextlib import contextmanager
from pathlib import Path
import collections
import fcntl
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time

import yaml

ROOT = Path(__file__).resolve().parents[1]
BASE = Path(sys.argv[1]).resolve()
CFG = yaml.safe_load((BASE / "experiment.yaml").read_text())
DOMAIN = CFG["domain"]
if DOMAIN not in ("alfworld", "dbbench", "webshop", "osbench"):
    raise ValueError("This reproduction entry covers the four native benchmark ablations")
MODE = CFG["scale"]["mode"]
RUN = BASE / "runs"
RUN.mkdir(exist_ok=True)
sys.path[:0] = CFG["scale"].get("pythonpath", [])
if DOMAIN != "telecom":
    from astra_evolve.project import Project


def read(path, default=None):
    return json.loads(path.read_text()) if path.is_file() else default


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    temp.replace(path)


def status(phase, **fields):
    write(BASE / "worker-status.json", {"phase": phase, "updated_at": time.time(), **fields})


@contextmanager
def slot(kind, number):
    directory = ROOT / "slots"
    directory.mkdir(exist_ok=True)
    while True:
        for i in range(number):
            handle = (directory / f"{kind}-{i}").open("a")
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                handle.close()
                continue
            try:
                yield
                return
            finally:
                handle.close()
        time.sleep(3 + random.random() * 3)


def trace_sample(rows, version):
    rng = random.Random(version)
    sample = []
    for good, count in [(False, 8), (True, 4)]:
        group = [r for r in rows if (r["score"] >= 1) == good]
        for row in rng.sample(group, min(count, len(group))):
            msgs = row.get("messages", [])
            sample.append({"task": row["task_id"], "score": row["score"], "first": msgs[:3], "last": msgs[-7:]})
    # Truncate individual traces so every sampled task remains represented.
    return "\n".join(json.dumps(x, ensure_ascii=False)[:2900] for x in sample)


def model(parent, version, rows, candidate):
    out = RUN / "optimizer"
    out.mkdir(exist_ok=True)
    file = out / f"{version}.json"
    if file.is_file():
        return read(file)
    policies = {slot_name:(candidate / f"scale-{slot_name}.mjs").read_text()
                for slot_name in ("memory", "action", "receipt")} if MODE == "B" else {}
    comp = read(candidate / "composition.json")
    skill = next(m["config"]["skill"] for m in comp["methods"] if m["id"] == "scale-slot")
    aspects = ["skill"] if MODE == "A" else ["skill", "memory", "action", "receipt"]
    surfaces = {
        "skill": "Reusable strategy and task guidance as plain text.",
        "memory": "Episode-local state. JS export function create() returns {observe(call, receipt), guide()}. observe updates local facts; guide returns a short factual state summary.",
        "action": "One action precondition. JS export function create() returns {check(call)}. Return a reason string to ask the actor to revise, or undefined to continue.",
        "receipt": "One receipt interpretation or recovery rule. JS export function create() returns {explain(call, receipt)}. Return a short annotation or undefined.",
    }
    if MODE=="C":
        aspects=["skill","composition"]
        surfaces["composition"]=(
            "One coherent executable mechanism edit. Return JSON text in content with keys skill and code. "
            "code is a JavaScript module exporting create(state), returning an ordered array of named "
            "mechanisms {id, observe(call, receipt), guide(), check(call), explain(call, receipt)}. "
            "Handlers are optional. The host supplies episode-local shared state. "
            "Name which mechanism writes each fact and which other mechanism uses it. "
            "All mechanisms may be edited together when the proposed repair requires it."
        )
        policies={"composition":(candidate/"scale-composition.mjs").read_text()}
    feedback = read(RUN / "feedback.json", {})
    prompt = f"""Role: improve a frozen Qwen agent in {DOMAIN} by turning training observations into one reusable candidate edit.
Inputs: the current parent, visible training traces, previous measured feedback, and the runtime interfaces.
Editable aspects: {json.dumps({a:surfaces[a] for a in aspects},ensure_ascii=False)}.
Choose exactly one aspect. Return its complete replacement in content and describe the evidence, expected behavior, and potential regression in reason.
All other aspects are inherited. Each executable aspect is a self-contained JavaScript module, uses only its function arguments and its own local state, and is wired to its designated interface by the host.
The host runs paired evaluation, records observed effects and decides promotion. The traces below are observations.
Parent: {parent}
Interface reference:
{(BASE/'interface.md').read_text()[:10000]}
Current skill:
{skill}
Current executable aspects:
{json.dumps(policies,ensure_ascii=False)}
Previous measured feedback:
{json.dumps(feedback,ensure_ascii=False)}
Training observations:
{trace_sample(rows,version)}
"""
    schema = {"type":"object","properties":{"aspect":{"type":"string","enum":aspects},
               "content":{"type":"string"},"reason":{"type":"string"}},
               "required":["aspect","content","reason"],"additionalProperties":False}
    schema_path = out / "schema.json"
    write(schema_path, schema)
    (out / f"{version}-input.txt").write_text(prompt)
    status("waiting_optimizer", candidate=version)
    with slot("optimizer", 4):
        if (ROOT/"quota-hold").exists():
            raise RuntimeError("Optimizer quota hold; preserve completed work")
        status("generating", candidate=version, model=CFG["optimizer"]["model"])
        reply = out / f"{version}-reply.txt"
        reply.unlink(missing_ok=True)
        cmd = [os.environ["SCALE_CODEX"], "exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only",
               "--model", CFG["optimizer"]["model"], "-c", 'model_reasoning_effort="high"',
               "--output-schema", str(schema_path), "--output-last-message", str(reply), "-"]
        with (out/f"{version}-events.jsonl").open("a") as events, (out/f"{version}-stderr.txt").open("a") as err:
            result = subprocess.run(cmd, cwd=BASE, input=prompt, text=True, stdout=events, stderr=err, timeout=900)
        errors = (out/f"{version}-events.jsonl").read_text().lower()
        if any(s in errors for s in ("usage limit", "quota exhausted", "usage_limit_reached")):
            (ROOT/"quota-hold").touch()
            raise RuntimeError("Yao Ma quota limit")
        if result.returncode:
            raise RuntimeError("Optimizer request failed, see round events")
        item = read(reply)
        write(file, item)
        return item


def install(candidate, item):
    comp = read(candidate / "composition.json")
    method = next(m for m in comp["methods"] if m["id"] == "scale-slot")
    aspect = item["aspect"]
    value = item["content"].strip()
    if aspect == "skill":
        method["config"]["skill"] = value[:12000]
        write(candidate/"composition.json", comp)
        return
    if MODE == "C" and aspect == "composition":
        item = json.loads(value)
        value = item["code"].strip()
        method["config"]["skill"] = item["skill"].strip()[:12000]
    elif MODE != "B" or aspect not in ("memory", "action", "receipt"):
        raise ValueError("Unexpected editable aspect")
    if not re.search(r"\bexport\s+function\s+create\s*\(", value):
        raise ValueError("Expected export function create()")
    if re.search(r"\b(?:import|require|process|fetch|globalThis|eval|Function)\b", value):
        raise ValueError("Expected a self-contained module")
    module = candidate / f"scale-{aspect}.mjs"
    module.write_text(value+"\n")
    check = subprocess.run([CFG["node"],"--check",str(module)],capture_output=True)
    if check.returncode:
        raise ValueError("Invalid JavaScript")
    if MODE == "C":
        write(candidate/"composition.json", comp)


class HookRuntimeError(RuntimeError):
    pass


def verify_hooks(rows):
    error = "Symbol(dsh.tool.execution) could not be cloned"
    if any(error in str(msg.get("content", "")) for row in rows for msg in row.get("messages", [])
           if msg.get("role") == "tool"):
        raise HookRuntimeError("DSH hook input failed before a valid selection decision")
    return rows


def measure(rows):
    good = sum(r["score"] >= 1 for r in rows)
    return {"valid":len(rows),"successes":good,"strict_success":good/len(rows),
            "mean_reward":sum(r["score"] for r in rows)/len(rows)}


def ident(row):
    return row["task_id"],row["trial"],row["seed"]


def signature(row):
    return {json.dumps([x.get("hook"),x.get("text"),x.get("reason"),x.get("annotation")],ensure_ascii=False)
            for x in row.get("activations",[]) if x.get("method_id")=="scale-slot" and x.get("hook")!="loaded"}


class Native:
    def __init__(self):
        self.p = Project(BASE/"experiment.yaml")
    def folder(self,v):
        return self.p.candidate(v)
    def prepare(self,v,parent):
        dst=self.folder(v)
        shutil.copytree(RUN/"frozen"/parent,dst,ignore=shutil.ignore_patterns("node_modules"))
        if MODE in ("B", "C"):
            shutil.copy2(ROOT/"final"/"slot-c.mjs", dst/"scale-slot.mjs")
        write(dst/"parent.json",{"parent":parent,"batch":self.p.batch(v)})
        return dst
    def score(self,v,split,batch=None):
        if split=="test" and v not in (read(RUN/"training-seal.json",{}).get("test_targets",[])):
            raise ValueError("Test target must be sealed after 40 decisions")
        try:
            return self.p.rows(v,split,batch)
        except RuntimeError:
            controls = read(ROOT/"evaluation-control.json", {})
            cap = controls.get("batch_slots", 6)
            floor = controls.get("disk_reserve_gib", 90) * 1024**3
            while shutil.disk_usage(ROOT).free < floor:
                time.sleep(60)
            domain_cap = controls.get("osbench_slots", 2) if DOMAIN=="osbench" else cap
            with slot(f"episode-{DOMAIN}",domain_cap), slot("episode",cap):
                self.p.evaluate(v,split,batch)
            return self.p.rows(v,split,batch)




def main():
    lock=(RUN/"controller.lock").open("a")
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    adapter=Native()
    rounds=CFG["rounds"]
    metric=CFG["scale"]["selection"]
    parent="baseline"
    promoted=[]
    for i in range(1,rounds+1):
        version=f"v{i:02d}"
        path=RUN/"decisions"/f"{version}.json"
        if path.is_file():
            if read(path)["adopted"]:
                parent=version
                promoted.append(version)
            continue
        batch=adapter.p.batch(version) if isinstance(adapter,Native) else None
        status("evaluating_parent",candidate=version,parent=parent,batch=batch)
        old=verify_hooks(adapter.score(parent,"train",batch))
        candidate=adapter.folder(version)
        if not candidate.exists():
            candidate=adapter.prepare(version,parent)
        item=model(parent,version,old,candidate)
        try:
            install(candidate,item)
        except (ValueError, KeyError, TypeError) as e:
            decision={"candidate":version,"parent":parent,"batch":batch,"adopted":False,"invalid_candidate":str(e),
                      "before":measure(old),"after":None}
        else:
            status("evaluating_candidate",candidate=version,parent=parent,batch=batch)
            new=verify_hooks(adapter.score(version,"train",batch))
            a,b=measure(old),measure(new)
            by={ident(r):r for r in old}
            effect=any(signature(r)!=signature(by[ident(r)]) for r in new)
            val=None
            if isinstance(adapter,Native) and "validation" in adapter.p.tasks:
                val=[measure(adapter.score(x,"validation")) for x in (parent,version)]
            adopted=b[metric]>a[metric] and effect and (not val or val[1][metric]>=val[0][metric])
            decision={"candidate":version,"parent":parent,"batch":batch,"adopted":adopted,"before":a,
                      "after":b,"validation":val,"observed_effect":effect,"aspect":item["aspect"],"proposal":item["reason"],
                      "repaired":sum(r["score"]>=1>by[ident(r)]["score"] for r in new),
                      "regressed":sum(by[ident(r)]["score"]>=1>r["score"] for r in new)}
        write(path,decision)
        write(RUN/"feedback.json",decision)
        if decision["adopted"]:
            parent=version
            promoted.append(version)
        write(RUN/"best.json",{"candidate":parent})
    # No test requests are made until all 40 decisions and the entire test list are sealed.
    targets=promoted or ["baseline"]
    write(RUN/"training-seal.json",{"best":parent,"rounds":rounds,"test_targets":targets})
    for v in targets:
        summary=RUN/"test-summaries"/f"{v}.json"
        if summary.exists():
            continue
        status("testing_promoted",candidate=v,remaining=len([x for x in targets if not (RUN/"test-summaries"/f"{x}.json").exists()]))
        rows=verify_hooks(adapter.score(v,"test"))
        result=measure(rows)
        per_task=collections.defaultdict(list)
        for row in rows:
            per_task[row["task_id"]].append(row["score"]>=1)
        result["pass_cubed"]=sum(len(x)==3 and all(x) for x in per_task.values())/len(per_task)
        write(summary,result)
    write(RUN/"final.json",{"best":parent,"rounds":rounds,"adopted":promoted,
          "test":read(RUN/"test-summaries"/f"{parent}.json")})
    status("complete", rounds=rounds, selected=parent)


if __name__=="__main__":
    try:
        main()
    except Exception as e:
        status("needs_attention",error=str(e))
        if isinstance(e, HookRuntimeError) or (ROOT/"quota-hold").exists():
            raise SystemExit(78) from None
        raise
