# Shared DSH evolution loop

A single execution/evaluation core with selectable L1–L9 strategies. The **36 three-benchmark profiles** preserve the recorded actor, optimizer, task IDs, budgets and selection differences. Deployment endpoints use environment variables. The package is a source-checkout release: use an editable installation.

```bash
cd evolution
python -m pip install -e .
dsh-evolve profiles
# Scripted actor + real DSH hooks + L7 plan/evaluate/adopt/final-test path.
# No model API or optimizer call; not a benchmark result.
python scripts/smoke.py ./workspaces/demo
```

[Reproduction guide](../docs/REPRODUCING.md) · [中文复现说明](../docs/REPRODUCING.zh-CN.md)

```text
src/astra_evolve/      tasks, freezing, evaluation, paired comparisons, runtime evidence
src/dsh_evolve/cli.py  one command entry
src/dsh_evolve/loops/  strategy differences, experience and component reuse
src/dsh_evolve/runners/ benchmark-specific execution semantics
adapters/             real environment and scoring bridges
profiles/             36 original three-benchmark configurations and task identities
```

`prepare → inspect/plan → edit plugins → evaluate → report → decide → finish` is the common workflow. Preparation, evaluation and promotion are programmatic; a persistent optimizer session proposes code. L8/L9 also use their explicitly configured learning calls. The synthetic example scripts the candidate so it proves the execution chain, not autonomous learning.

DBBench, WebShop and OSBench require their external benchmark assets/services. ALFWorld has an environment adapter; its historical search and Telecom's two-role workflow are not silently mapped to these three-benchmark profiles. New feedback loops and older Skill/Workflow methods remain separately documented research conditions. Source availability and a passing fixture do not mean historical experiments have been rerun.
