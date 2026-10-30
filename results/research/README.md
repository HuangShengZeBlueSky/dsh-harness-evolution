# Research data / 方法与进化记录

This directory links methods to actual configurations, selection decisions, measured tests, and archived curves. It is a timestamped release snapshot, not a live experiment controller.

本目录把**方法—配置—任务编号—逐轮采用—最终测试**放到一起。训练、验证、最终选定测试、回溯补测分别保存；空值表示没有可公开核实的测量，不是零分。

## Read first

| File | What it contains |
|---|---|
| `runs.json` | 61 native campaigns: 51 completed historical mainline groups and 10 feedback groups; configurations, decisions, test aggregates and runtime counts |
| `historical-curves.json` | All 105 registered historical curves, including Astra/Luna, starts, model/session variants, methods 1/2, Playbook, archived 20-round stages, and L1–L9 |
| `historical-protocols.json` | Configuration availability for the 105 archived curves; archived-stage/legacy settings are explicitly left unavailable rather than inferred from another configuration |
| `protocols/`, `tasks/` | Recorded settings and exact task IDs, repeat indices and seeds, with model/environment connection inputs replaced by placeholders |
| `test-outcomes/` | Per-task numeric outcomes for the selected final checkpoints; no prompts, conversations or model requests |
| `published-artifact-summary.json` | Five published final artifacts, retrospective checkpoints, and the public Telecom reproduction |
| `paper-references.json` | Source/version-labelled paper references, including other reported methods and historical Telecom values |
| `collect.py` | Read-only native-result export; never launches or modifies an experiment |

Some runs occur in both `runs.json` and the historical archive. Join by `id`; do not count them twice. The nine IDs ending in `#stage20` are earlier budget snapshots of later extended runs, not nine independent experiments. `method_id` refers to the public method catalogue; protocol details, model and startpoint remain necessary to identify an experiment.

## Metrics and important distinctions

- `final_selection` preserves the native final-checkpoint record. `final_test` is recomputed from the corresponding actual test results, keeping the latest valid result per `(task_id, trial, seed)`.
- `strict_pass_at_1` is successes divided by valid episodes. `mean_reward` is mean native reward; these differ on WebShop. `per_repeat` reports both. The population standard deviation describes those observed test repeats, **not uncertainty across independent evolution runs**.
- `observed_any_success_3` is the fraction of task groups with at least one success in all three recorded trials. `observed_all_success_3` requires success in every trial. They are null unless every task has three distinct trials; these are observed repeat-group metrics, not an extrapolated estimator.
- `valid_episodes`, `expected_episodes`, `missing_episodes` describe final coverage. `invalid_attempts` counts invalid records in the available result ledger; it does not claim to include every infrastructure attempt that may have been logged elsewhere.
- `curve.training.mean` remains the native reward mean. `training_strict`, `validation_strict`, and `validation_mean_reward` are separate fields. The original `validation` field retains its original decision-record meaning. **For WebShop L5, use explicit strict fields when explaining its adoption objective.**
- `batch` identifies rotating development batches when recorded. Connecting training means from different batches does not create a fixed-task learning curve. `parent_training` provides the same-batch parent comparison when available.
- `paired` contains strict-success repair/regression counts from native mechanism records; `paired_reward` contains native reward increases/decreases. They answer different questions. A target repair can coexist with other regressions; an adopted candidate may improve total score without repairing its planned target.
- Runtime counts distinguish plugin events, request observations and effective runner receipts. They document execution, **not component causality**. `planned_target_repairs` excludes clusters with no assigned plugin.
- The sum of episode elapsed time is aggregate work across concurrent episodes, not wall-clock runtime. `first_to_last_decision_seconds` omits startup and final testing. No throughput or total cost is inferred from configured concurrency.
- `independent_search_repetitions: 1` means one adaptive search per named group. Three test trials do not become three independent searches. Optimizer/learning tokens and currency cost remain null where uniform accounting was unavailable.

Historical `test` dots and `independent_test` are separate measurements. They may refer to selected-checkpoint repeats or retrospective testing; `test_kind` and artifact release metadata determine the interpretation. Do not use the highest test point to rewrite the recorded final selection.

## Re-collect native records

Install `PyYAML`, place this collector on a machine that holds the named experiment directories, and run:

```bash
python collect.py --root /path/to/experiments --output /path/to/export
```

The output includes only aggregate decisions, numeric outcomes and sanitized configuration evidence. `--skip-episodes` reuses an existing final-test export only if the selected checkpoint is unchanged; leave it off when regenerating the complete snapshot. This exporter does not provide benchmark datasets, images, model credentials or missing historical logs. The archived curves are frozen source records, not fabricated reruns of the cleaned public package.

Source identity is preserved as relative experiment names and checkpoint IDs. Machine paths and request content are not required to interpret the public records. Execution recipes and their current support boundaries are documented separately in the repository reproduction guide.
