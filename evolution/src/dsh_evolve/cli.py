"""Evaluate a paper checkpoint or run the controlled A/B/C search."""
import argparse
import json
import shutil
import statistics
from pathlib import Path

import yaml

from astra_evolve.config import load_config
from astra_evolve.records import write

ROOT = Path(__file__).resolve().parents[3]
ENGINE = ROOT / "evolution"


def initialize(directory, profile, assets=None, baseline=None):
    template = ROOT / "configs" / profile
    config_file = template / "experiment.yaml"
    if not config_file.exists():
        raise ValueError("Choose a profile listed by dsh-evolve profiles")
    config = yaml.safe_load(config_file.read_text())
    if config.get("mode") == "frozen" and baseline is None:
        baseline = ROOT / "artifacts" / config["domain"].lower()
    destination = Path(directory).resolve()
    shared = template.parent / "common"
    if shared.is_dir():
        shutil.copytree(shared, destination)
        shutil.copytree(template, destination, dirs_exist_ok=True)
    else:
        shutil.copytree(template, destination)
    domain = config["domain"].lower()
    if config.get("scale") or domain == "osbench":
        runtime = ENGINE / "src/dsh_evolve/assets" / domain
        shutil.copytree(runtime, destination / "runtime", ignore=shutil.ignore_patterns("environment.py"))
        shutil.copy2(runtime / "environment.py", destination / "environment.py")
    else:
        shutil.copytree(ENGINE / "src/astra_evolve/assets/runtime", destination / "runtime")
        shutil.copy2(ENGINE / "adapters" / domain / "environment.py", destination / "environment.py")
        if domain == "alfworld":
            for name in ("host.mjs", "bridge.mjs", "package.json"):
                shutil.copy2(ENGINE / "src/dsh_evolve/assets/alfworld" / name, destination / "runtime" / name)
    if baseline:
        if (destination / "baseline").exists():
            shutil.rmtree(destination / "baseline")
        shutil.copytree(baseline, destination / "baseline", ignore=shutil.ignore_patterns("node_modules"))
    elif not (destination / "baseline").exists():
        (destination / "baseline/plugins").mkdir(parents=True)
        write(destination / "baseline/composition.json", {"methods": [], "selected": []})
    if assets:
        asset_root = Path(assets).resolve()
        for name in ("source", "data", "fixtures", "deps"):
            if (asset_root / name).exists():
                (destination / name).symlink_to(asset_root / name, target_is_directory=True)
    reference = ENGINE / "benchmark_sources" / domain
    if reference.exists() and not (destination / "source").exists():
        shutil.copytree(reference, destination / "source")
    if domain == "dbbench" and not (destination / "tools.json").exists():
        shutil.copy2(ENGINE / "src/dsh_evolve/assets/dbbench/tools.json", destination / "tools.json")
    environment = config["benchmark"].get("environment", {})
    for field in ("system_prompt_file", "tools_file", "fault_log"):
        if environment.get(field):
            environment[field] = str(destination / Path(environment[field]).name)
    (destination / "experiment.yaml").write_text(yaml.safe_dump(config, sort_keys=False))
    (destination / "progress.txt").write_text("Initialized. Ready for runtime setup and evaluation.\n")
    print(destination / "experiment.yaml")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    commands.add_parser("profiles")
    init = commands.add_parser("init")
    init.add_argument("directory")
    init.add_argument("--profile", required=True)
    init.add_argument("--assets")
    init.add_argument("--baseline")
    for action in ("setup", "run", "test-artifact", "status"):
        commands.add_parser(action).add_argument("config")
    args = parser.parse_args()
    if args.action == "profiles":
        for path in sorted((ROOT / "configs").rglob("experiment.yaml")):
            print(path.parent.relative_to(ROOT / "configs"))
        return
    if args.action == "init":
        initialize(args.directory, args.profile, args.assets, args.baseline)
        return
    if args.action == "setup":
        from astra_evolve.cli import setup
        setup(args.config)
        return
    config = load_config(args.config)
    if args.action == "status":
        base = Path(args.config).resolve().parent
        if config.get("mode") == "frozen":
            print(json.dumps({"checkpoint": config["checkpoint"], "evaluation": str(base / "runs/evaluations/baseline/test")}))
            return
        decisions = list((base / config.get("output", "runs") / "decisions").glob("v*.json"))
        print(json.dumps({"method": config.get("scale", {}).get("mode", config.get("loop", {}).get("variant")),
                          "decisions": len(decisions), "budget": config["rounds"]}))
        return
    if args.action == "test-artifact":
        from astra_evolve.project import Project
        project = Project(args.config)
        if config.get("mode") != "frozen":
            parser.error("Choose a frozen profile for checkpoint evaluation.")
        project.evaluate("baseline", "test")
        repeats = {}
        for row in project.rows("baseline", "test"):
            repeats.setdefault(row["trial"], []).append(row["score"] >= 1)
        rates = [100 * statistics.mean(scores) for scores in repeats.values()]
        print(json.dumps({"success_percent_by_trial": rates, "mean_percent": statistics.mean(rates),
                          "sample_sd_pp": statistics.stdev(rates)}, indent=2))
        return
    if not config.get("scale"):
        parser.error("Choose an abc profile for search.")
    from .abc import run
    run(args.config)


if __name__ == "__main__":
    main()
