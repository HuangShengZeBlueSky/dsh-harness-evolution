# DSH Harness Evolution

**How much can a frozen agent improve by evolving its harness?**

We study how improver capability and editable scope shape the harnesses discovered from execution feedback. A frozen Qwen3-4B executor solves tasks; a separate improver updates the plugins around it on **DeepSeek Harness**.

[Project page](https://huangshengzebluesky.github.io/dsh-harness-evolution/?lang=en) · [Results](LEADERBOARD.md) · [Reproduce](docs/REPRODUCING.md) · [Artifacts](harnesses/) · [简体中文](README.zh-CN.md)

## Method

**Observe and attribute → propose a candidate → evaluate and select → retain feedback.**

The loop reads the current harness and its execution traces, proposes a reusable repair, and compares it with its parent. DSH supplies the execution loop, plugin lifecycle, prompt assembly, tool hooks and episode state.

![Controlled harness search on DSH](paper/previews/abc-search-procedure.png)

**L4** is the historical capability-guided search recipe. It describes the current agent's abilities and plugin responsibilities before proposing code edits. **A/B/C** controls which edits the improver may make within a shared search procedure.

| Scope | Editable surface |
|---|---|
| A | Skill text |
| B | One independent component per round: skill, memory, action checking or receipt interpretation |
| C | Skill or coordinated mechanisms sharing episode-local state across hooks |

[L4 implementation](evolution/src/dsh_evolve/loops/l4.py) · [A/B/C controller](evolution/src/dsh_evolve/abc.py) · [Recorded configurations](configs/)

## What evolves?

The released **DBBench L4 harness reaches 70.56% test success**. Its write workflow records database receipts in episode state. Later context exposes that state to the solver, while action checks use it to handle repeated writes and premature submission. Other plugins provide schema grounding, result handling and recovery.

![Evolved DBBench harness](paper/previews/artifact-architecture.png)

[Inspect the harness](harnesses/dbbench/20261026-l4-h0-sol61-v35/) · [Runtime protocol](harnesses/dbbench/20261026-l4-h0-sol61-v35/protocol.json) · [Recorded evaluation](harnesses/dbbench/20261026-l4-h0-sol61-v35/evaluation.json)

## Results and evolution

<!-- paper-table:start -->
| Benchmark | Historical measured peak | Historical final-selected |
|---|---:|---:|
| ALFWorld | 95.41% | 95.41% |
| DBBench | 70.56% | 70.56% |
| WebShop · historical | 47.00% | 44.33% |
| WebShop · frozen | 48.17% | — |
| OSBench | 39.35% | 38.89% |
| Telecom | 87.50% | 84.17% |
<!-- paper-table:end -->

![Training and measured test trajectories](paper/previews/main-full-train-test.png)

<details>
<summary>Experimental settings and checkpoint selection</summary>

The table follows the paper's historical artifact lineages. Measured peaks and development-selected checkpoints retain their identities. ALFWorld uses 20 rounds; the other plotted searches use 40. WebShop has separate historical and frozen catalogs, and its non-continuation curve differs from the continuation in the table. Local Telecom uses a GLM user simulator. The separate OSBench C data-control peak of 41.67% is retained in the supplementary figures.

The matched A/B/C search runs have their own [final-selected results](paper/data/controlled-abc.json). Test repeats measure execution variability of a frozen checkpoint. [Full comparison table](LEADERBOARD.md) · [Configuration mapping](paper/data/curve-manifest.json).
</details>

## Explore the experiments

| Question | Evidence |
|---|---|
| What changes across improvers and reasoning effort? | [Eight C configurations per benchmark](paper/README.md#多配置进化曲线) |
| What changes across editable scopes? | [Nine-panel model × scope plots](https://huangshengzebluesky.github.io/dsh-harness-evolution/?lang=en#curves) and [matched A/B/C records](paper/data/controlled-abc.json) |
| What changes with training data? | [C data-control configurations](configs/abc/) and their measured outcomes |
| How do training gains relate to held-out performance? | [Evolution and late-regression figures](paper/README.md) |

The four-benchmark collection contains **68 curve panels**, with measured test points, uncertainty where available, and configuration identities. [All 28 figures](paper/README.md) · [Numeric trajectories](paper/data/trajectories.json).

## Quick start

Prepare the benchmark assets and model access described in the [environment guide](docs/REPRODUCING.md), then run:

~~~bash
python -m pip install -e evolution
dsh-evolve init ./runs/db-c --profile abc/dbbench/C-sol61 --assets /data/dbbench
dsh-evolve setup ./runs/db-c/experiment.yaml
dsh-evolve run ./runs/db-c/experiment.yaml
~~~

- **Historical L4 search** — select a profile from [configs/l4](configs/l4/).
- **Controlled A/B/C search** — select a profile from [configs/abc](configs/abc/).
- **Frozen-artifact evaluation** — load a [released harness](harnesses/) with the matching [evaluation protocol](docs/REPRODUCING.md#frozen-artifacts).

The [installation check](evolution/scripts/smoke.py) exercises the runtime on a synthetic task without paid model calls.

## Code and data

| Directory | Contents |
|---|---|
| [evolution](evolution/) | Shared runtime, L4 recipe and A/B/C controller |
| [configs](configs/) | Exact task schedules, model settings and starting compositions |
| [harnesses](harnesses/) | Five-benchmark artifacts, diagrams, protocols and measurements |
| [paper](paper/) | Figures, tables and numeric experiment records |

[Software citation](CITATION.cff) · [Publishing results](docs/PUBLISHING.md) · [MIT license](LICENSE)

Built on [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Benchmark and dependency credits are listed in [Third-party notices](docs/THIRD_PARTY.md).
