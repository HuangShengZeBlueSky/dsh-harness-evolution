"""Exercise L4 and A/B/C with a scripted provider and a synthetic task."""
import argparse
import json
import shutil
from pathlib import Path

import yaml

from astra_evolve.cli import init, setup, ASSETS
from astra_evolve.demo import ScriptedProvider
from astra_evolve.records import write
from dsh_evolve.factory import campaign
from dsh_evolve import abc

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory")
parser.add_argument("--runtime-deps")
args = parser.parse_args()
root = Path(args.directory).resolve()
dependencies = Path(args.runtime_deps).resolve() if args.runtime_deps else None

with ScriptedProvider() as endpoint:
    for mode in ("L4", "A", "B", "C"):
        folder = init(root / mode, "demo")
        config = yaml.safe_load((folder / "experiment.yaml").read_text())
        config.update(rounds=1, domain="alfworld", test_schedule="sealed_all_promoted")
        config["benchmark"].update(max_steps=8, max_model_calls=8, timeout_seconds=30, runner="demo")
        config["benchmark"]["model"].update(name="scripted", base_url=endpoint, api_key_env="", max_retries=0)
        if mode == "L4":
            config.update(domain="Demo", loop={"variant": "L4", "require_agent_map": True}, start_label="H0")
        else:
            config["scale"] = {"mode": mode, "selection": "strict_success"}
            wrapper = "slot-c.mjs" if mode == "C" else "slot-ab.mjs"
            shutil.copy2(abc.ASSETS / wrapper, folder / "baseline/scale-slot.mjs")
            for name in ("memory", "action", "receipt"):
                (folder / "baseline" / f"scale-{name}.mjs").write_text("export function create() { return {}; }")
            (folder / "baseline/scale-composition.mjs").write_text("export function create() { return []; }")
            write(folder / "baseline/composition.json", {"methods": [{"id": "scale-slot", "module": "scale-slot.mjs",
                  "config": {"mode": mode, "skill": ""}}], "selected": ["scale-slot"]})
        path = folder / "experiment.yaml"
        path.write_text(yaml.safe_dump(config))
        if dependencies:
            (folder / "runtime/node_modules").symlink_to(dependencies, target_is_directory=True)
        else:
            setup(path)
            dependencies = folder / "runtime/node_modules"
        if mode == "L4":
            project = campaign(path)
            project.evaluate("baseline", "development")
            project.prepare("v01")
            candidate = project.candidate("v01")
            (candidate / "proposal.md").write_text("Recover a premature finish using a tool check.")
            shutil.copy2(ASSETS / "example-plugins/one-recovery.mjs", candidate / "plugins/one-recovery.mjs")
            write(candidate / "composition.json", {"methods": [{"id": "one-recovery", "module": "plugins/one-recovery.mjs",
                  "config": {}}], "selected": ["one-recovery"]})
            project.evaluate("v01", "development")
            project.decide("v01", True, "Synthetic runtime check")
            project.finish()
        else:
            code = """export function create(state = {}) {
  return {check(call) {
    if (call.arguments.command === 'finish' && !state.used) {
      state.used = true;
      return 'RECOVER: take -> clean -> put.';
    }
  }};
}"""
            if mode == "A":
                proposal = {"aspect": "skill", "content": "Complete the visible task.", "reason": "Synthetic text edit"}
            elif mode == "B":
                proposal = {"aspect": "action", "content": code, "reason": "Synthetic action check"}
            else:
                code = code.replace("return {check", "return [{id: 'recover', check").replace("  }};", "  }}];")
                proposal = {"aspect": "composition", "content": json.dumps({"skill": "", "code": code}),
                            "reason": "Synthetic shared state"}
            original = abc.model
            try:
                abc.model = lambda *arguments: proposal
                abc.run(path)
            finally:
                abc.model = original
            result = json.loads((folder / "runs/final.json").read_text())
            assert result["best"] == ("baseline" if mode == "A" else "v01"), (mode, result)
        print("PASS", mode)
print("Synthetic installation check complete; benchmark scores require real evaluation.")
