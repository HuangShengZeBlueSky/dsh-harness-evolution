# Benchmark scoring code

The DBBench and OSBench adapters use task initialization and scoring routines from the Life-Harness/AgentBench source snapshot used in the October 2026 experiments. Each benchmark directory includes its upstream license.

| Directory | Role |
| --- | --- |
| `dbbench/AgentBench/src/server/tasks/dbbench/` | Database initialization, SQL execution, and result processing |
| `dbbench/AgentBench/src/server/harness/` | Reference-wrapper interfaces for DBBench |
| `osbench/` | OSBench fixture loading, grading, and reference-wrapper interfaces |

During setup, `dsh-evolve init` uses the asset directory’s `source/` when present. Otherwise it copies the bundled scoring code into the workspace. See the [reproduction guide](../../REPRODUCING.md) for datasets, services, and task images, and [Life-Harness](https://github.com/Tianshi-Xu/Life-Harness) for the upstream project.
