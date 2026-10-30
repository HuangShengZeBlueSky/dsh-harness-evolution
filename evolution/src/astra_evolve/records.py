"""Benchmark-independent mechanics extracted from the native-plugin campaign."""
import json
import math
import statistics
import subprocess
import sys
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def jsonl(path):
    path = Path(path)
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def key(row):
    return str(row["task_id"]), int(row["trial"]), int(row["seed"])


def load_tasks(path):
    rows = jsonl(path)
    if not rows or len({key(row) for row in rows}) != len(rows):
        raise ValueError(f"Task list must be nonempty with unique task_id/trial/seed: {path}")
    return [{"task_id": k[0], "trial": k[1], "seed": k[2]} for k in map(key, rows)]


def command(args):
    return [sys.executable if arg == "{python}" else str(arg) for arg in args]


def selected(candidate):
    candidate = Path(candidate)
    comp = read(candidate / "composition.json")
    methods = comp["methods"]
    ids = [m["id"] for m in methods]
    active = comp.get("selected", ids)
    if len(ids) != len(set(ids)) or len(active) != len(set(active)) or set(active) - set(ids):
        raise ValueError("composition.json has duplicate or unknown plugin IDs")
    result = []
    for method in methods:
        if method["id"] not in active:
            continue
        module = (candidate / method["module"]).resolve()
        if candidate.resolve() not in module.parents or module.suffix != ".mjs" or not module.is_file():
            raise ValueError(f"Plugin module must be a local .mjs file: {method['module']}")
        result.append({**method, "module": str(module), "config": method.get("config", {})})
    return result


def snapshot(candidate):
    return {m["id"]: {"source": Path(m["module"]).read_text(encoding="utf-8"),
                       "config": m["config"]} for m in selected(candidate)}


def changes(parent, candidate):
    before, after = snapshot(parent), snapshot(candidate)
    return {"changed_active": [k for k, v in after.items() if before.get(k) != v],
            "removed": sorted(set(before) - set(after))}


def syntax_check(candidate, node):
    for method in selected(candidate):
        subprocess.run([node, "--check", method["module"]], check=True)


def results(path, tasks):
    expected = {key(row) for row in tasks}
    latest = {}
    for row in jsonl(path):
        k = key(row)
        if k not in expected:
            raise ValueError(f"Unexpected evaluated episode {k}")
        if k in latest and latest[k].get("valid") is True:
            raise ValueError(f"Completed episode was evaluated twice: {k}")
        if row.get("valid") is True:
            score = row.get("score")
            if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score):
                raise ValueError(f"Valid episode needs a finite numeric score: {k}")
            if not isinstance(row.get("messages"), list):
                raise ValueError(f"Valid episode needs actor-visible messages: {k}")
        latest[k] = row
    return latest


def summary(rows):
    valid = [r for r in rows if r.get("valid") is True]
    by_trial = {}
    for row in valid:
        by_trial.setdefault(str(row["trial"]), []).append(row["score"])
    repeats = {trial: statistics.mean(scores) for trial, scores in by_trial.items()}
    return {"episodes": len(rows), "valid": len(valid), "invalid": len(rows) - len(valid),
            "mean": statistics.mean(r["score"] for r in valid) if valid else None,
            "strict_pass_at_1": statistics.mean(r["score"] >= 1.0 for r in valid) if valid else None,
            "strict_successes": sum(r["score"] >= 1.0 for r in valid),
            "repeat_means": repeats,
            "repeat_standard_deviation": statistics.pstdev(repeats.values()) if repeats else None}


def paired(before, after, direction):
    old = {key(row): row for row in before}
    counts = Counter()
    changed = []
    for row in after:
        previous = old[key(row)]
        delta = (row["score"] - previous["score"]) * direction
        outcome = "improved" if delta > 0 else "regressed" if delta < 0 else "unchanged"
        counts[outcome] += 1
        if delta:
            changed.append({"task_id": row["task_id"], "trial": row["trial"], "seed": row["seed"],
                            "before": previous["score"], "after": row["score"], "outcome": outcome})
    return {**{k: counts[k] for k in ["improved", "regressed", "unchanged"]}, "changed": changed}


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)


def runtime_evidence(rows, ids):
    result = {ident: {"loaded": 0, "events": 0, "request_hits": 0,
                      "control_receipts": 0, "examples": []} for ident in ids}
    for row in rows:
        if row.get("valid") is not True:
            continue
        for ident in ids:
            item = result[ident]
            events = [e for e in row.get("activations", []) if e.get("method_id") == ident]
            active = [e for e in events if e.get("hook") != "loaded"]
            item["loaded"] += len(events) - len(active)
            item["events"] += len(active)
            # Match exact additions against actual model request bodies, not audit text alone.
            texts = {e[k] for e in active for k in ["text", "annotation", "instructions", "summary", "reason"]
                     if isinstance(e.get(k), str) and e[k]}
            hits = []
            for i, request in enumerate(row.get("requests", [])):
                values = list(strings(request.get("body", {})))
                if any(text in value for text in texts for value in values):
                    hits.append(i)
            receipts = [e for e in row.get("executions", [])
                        if e.get("method_id") == ident and e.get("effective") is True
                        and e.get("source") == "runner"]
            item["request_hits"] += len(hits)
            item["control_receipts"] += len(receipts)
            if (hits or receipts) and len(item["examples"]) < 3:
                item["examples"].append({"episode": list(key(row)), "request_indices": hits[:3],
                                         "executions": receipts[:3]})
    return {"plugins": result, "note": "Events are plugin self-reports. Request matches prove input exposure, "
            "not causal benefit. Execution receipts must come from the runner. Behavior needs trace review."}


def materials(rows, folder, success_score, direction):
    folder = Path(folder)
    entries = []
    for i, row in enumerate(rows):
        name = f"E{i + 1:04d}"
        messages = row["messages"]
        write(folder / "traces" / f"{name}.json", {
            "episode_id": name, "task_id": row["task_id"], "trial": row["trial"], "seed": row["seed"],
            "score": row["score"], "messages": messages})
        ending = [m for m in messages if m.get("role") in ["assistant", "user"] and m.get("content")][-4:]
        entries.append({"episode_id": name, "task_id": row["task_id"], "trial": row["trial"],
                        "seed": row["seed"], "score": row["score"],
                        "success": (row["score"] - success_score) * direction >= 0,
                        "trace": f"traces/{name}.json",
                        "ending": [{"role": m["role"], "content": str(m["content"])[:700]} for m in ending]})
    write(folder / "failure-index.json", {"total": len(entries),
          "failures": [x for x in entries if not x["success"]],
          "successful_references": [x for x in entries if x["success"]]})
