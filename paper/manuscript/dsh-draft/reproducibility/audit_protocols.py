"""Check the published split manifests without model or environment calls."""
from pathlib import Path
import json
root = Path(__file__).resolve().parent
protocols = json.loads((root / "protocols.json").read_text())
for bench, p in protocols.items():
    batches = p["ordered_train_batches"]
    train = [x for batch in batches for x in batch]
    validation, test = p["validation"], p["test"]
    ids = lambda rows: {x["task_id"] for x in rows}
    assert not ids(train) & ids(validation)
    assert not ids(train) & ids(test)
    assert not ids(validation) & ids(test)
    assert len({(x["task_id"], x["trial"], x["seed"]) for x in test}) == len(test)
    assert len(test) == 3 * len(ids(test))
    assert {x["trial"] for x in test} == {0, 1, 2}
    assert {x["seed"] for x in test} == {42, 43, 44}
    for i, batch in enumerate(batches, 1):
        path = root / "manifests" / bench / f"train-batch-{i:02d}.jsonl"
        assert [json.loads(line) for line in path.read_text().splitlines()] == batch
    print(f"{bench}: train={len(ids(train))}, batches={[len(b) for b in batches]}, validation={len(ids(validation))}, test={len(ids(test))} x 3; disjoint")
