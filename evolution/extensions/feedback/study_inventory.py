"""Read native records without changing host selection, locks, or completed work."""
import json
import os
import time
from pathlib import Path
import yaml

ROOT = Path(os.environ['DSH_FEEDBACK_ROOT']).expanduser().resolve()
DATA = ROOT.parent


def read(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(path)


def native_rows(path):
    latest = {}
    if path.exists():
        for line in path.open():
            if line.strip():
                r = json.loads(line)
                latest[(str(r['task_id']), r['trial'], r['seed'])] = r
    return latest

