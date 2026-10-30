# Reproduction: artifacts, search, and historical results

The repository publishes three different things: **evaluated harnesses**, **evolution code**, and **recorded protocols/results**. They are linked, but installing the package does not reproduce every historical score. Rediscovering a good plugin through search is also a different experiment from evaluating a fixed artifact.

| Goal | Included | Remaining requirements |
|---|---|---|
| Inspect/load five-benchmark artifacts | Plugins, compositions, diagrams, protocols and curves in `harnesses/` | Actor service and corresponding benchmark environment; a running server is not an evaluation |
| Run DBBench/WebShop/OSBench L1–L9 | Shared execution/evaluation, strategy modules, 36 configurations, task IDs and scoring bridges in `evolution/` | Dataset/environment assets, actor and optimizer access |
| Reproduce historical ALFWorld search | Artifact, recorded protocol and actual environment adapter | Historical search not ported to these 36 profiles; generic inventory is not the published 109-task test set |
| Reproduce historical Telecom search | Artifacts and two-role integration | Matching Tau2 extensions, GLM user, account facts and auxiliary review permissions; not the single-executor loop |
| Run later summary/mechanism feedback | Actual core source, ten optimizer prompts, native host references | Separate historical integration; portable end-to-end launch has not been validated |
| Earlier Skill/Workflow experiments | Method descriptions and bounded historical results | Not switches of one DSH implementation; not rerun by this package |

## Start with the small runnable example

Use Python 3.10+ and Node.js 22.19+. This release is a source checkout with an editable installation; profiles/adapters are repository assets, not a standalone wheel promise.

```bash
cd evolution
python -m venv .venv
source .venv/bin/activate
python -m pip install -e .
python scripts/smoke.py ./workspaces/demo
```

The fixture uses a scripted actor and a prewritten candidate. It executes real DSH hooks and L7 preparation, planning, evaluation, adoption and final testing. It proves the execution chain, **not autonomous discovery or benchmark performance**. npm installs the pinned runtime dependencies on the first run; no actor or optimizer API is called.

This release passed that chain with four training, two validation and two test episodes. The candidate's bounded denial/recovery changes the next actual action. The 36 formal campaigns were not rerun after packaging.

## Run a new campaign

The following example calls real model/environment services. Prepare matching assets first and use a new output directory.

```bash
cd evolution
source .venv/bin/activate
export BENCH_BASE_URL=http://localhost:8000/v1
export BENCH_CHAT_URL=http://localhost:8000/v1/chat/completions
export BENCH_TOKENIZER_URL=http://localhost:8000/tokenize
# Set BENCH_API_KEY if your endpoint requires authentication.
dsh-evolve init ./workspaces/os-l7 \
  --profile osbench-l7-sol61 --assets /data/os-assets
# Review experiment.yaml: model, tasks, Docker connection and budgets.
dsh-evolve setup ./workspaces/os-l7/experiment.yaml
dsh-evolve run ./workspaces/os-l7/experiment.yaml
```

`init` copies the selected protocol, prompts, task IDs and runtime template. DB/OS scoring-source subsets are included unless your asset directory explicitly supplies its own `source/`. `run` collects baseline evaluation before starting a persistent optimizer session. Strategy code enforces adoption; `finish` seals selection before the final test. Test results are not fed into another candidate.

URLs are deployment settings, not model identity. `${ENVIRONMENT_VARIABLE}` values are resolved when loading a configuration. Actor names, temperatures, budgets, task lists and strategy remain YAML-owned. `BENCH_BASE_URL`, `BENCH_CHAT_URL` and `BENCH_TOKENIZER_URL` must refer to the same actor and tokenizer. The recorded profiles use `Qwen3-4B-Instruct-2507` and optimizer `gpt-6.1-sol`/high; substituting another available model is a new condition. The optimizer and L8/L9 learning calls require your own valid CLI login/model access.

### Benchmark resources

| Benchmark | Assets/service | Preserved semantics |
|---|---|---|
| DBBench | MySQL 8.4; `pip install -e '.[dbbench]'`; `data/db_out_new.jsonl`, `data/standard.jsonl` | 15 model calls; 32,768 context; 4,096 output; native database initialization/grading. Configure `mysql_host`, `mysql_port`, `mysql_password_env` |
| WebShop | Matching product/goal data and `/reset`, `/step`, `/close` service; set `WEBSHOP_URL` | 20 calls/tool steps; mean reward and strict purchase success are different metrics |
| OSBench | Docker; `fixtures/{train,test}/*.json` and matching `os-evolve/*` images | 16 calls/tool steps; 800-character observation protocol; native match/script grading |
| ALFWorld | Official game assets and ALFWorld 0.4.2, TextWorld 1.7.0, spaCy 3.7.5, NumPy 1.26.4 | Included historical adapter preserves admissible-action/action-mapping behavior; the generic demo is not this protocol |
| Telecom | Matching Tau2 two-role environment, tasks, GLM user and interface permissions | Account-fact access and auxiliary review are extra capabilities and must remain declared |

The small original scoring-source subset and its licenses are in `evolution/benchmark_sources/`. Datasets, databases and task images are not in Git. Matching task IDs alone does not establish matching products, database contents, images or graders. A different environment asset is a different protocol.

## Strategy identity

| Strategy | Actual selection/input change | Module |
|---|---|---|
| L1 | Strict same-batch training gain, non-regressing validation, observed changed-plugin use | `loops/l123.py` |
| L2 | L1 plus non-decreasing score on a fixed training subset; **not parent-success-only replay** | `l123.py`, `loop_policy.py` |
| L3 | Up to three validation-ranked branches; least-used parent first; retaining a branch need not change champion | Same modules |
| L4 | Explain current plugin capabilities/responsibilities before proposing; validation gate only where the configuration has validation | `loops/l45.py` |
| L5 | DB next-batch review; Web strict-success selection; OS validation-family macro gate | `loops/l45.py` |
| L6 | Plan before coding; complete same-batch strict gain and actual planned-plugin use; no independent-validation gate | `loops/l6.py` |
| L7 | L6 plus complete failure-index classification, independent validation and benchmark-specific gates | `loops/l789.py` |
| L8 internal/external | On L7, learn after each decision / learn prior whole campaigns once and hold that advice fixed | `l789.py`, `learning.py` |
| L9 | On L7, select/modify training-selected prior components for current failures | `loops/l789.py` |

Actual inheritance is `Project → L1–3 / L4–5 / L6 → L7–9`, not a fully cumulative L1→L9 chain. The following values are **training tasks + separate validation tasks**. Exact task IDs, seeds and model settings are in the profiles and [profile index](../evolution/profile-index.json).

| Benchmark | L1–L3 | L4 H0 | L5 H0 | L6 | L7–L9 | Final test |
|---|---|---|---|---|---|---|
| DBBench | 240 + 60 | 300 + 0 | 240 + 60 | 300 + 0 | 300 + 60 | 300 × 3 |
| WebShop | 240 + 60 | 300 + 0 | 240 + 60 | 300 + 0 | 300 + 60 | 200 × 3 |
| OSBench | 80 + 20 | 80 + 20 | 83 + 17 | 300 + 0 | 300 + 60 | 144 × 3 |

DB/Web rotate six batches. OS L1–L5 use fixed sets; L6–L9 rotate six batches. Parent and candidate comparisons use the same batch; scores across rotating batches are not a fixed-test monotonic curve. All 36 profiles budget 40 new candidates. Seeded continuations also inherit earlier search cost. Task seeds identify repeats; with `send_seed: false`, they are not sent to the actor endpoint, so output determinism is not promised.

### Prior resources are part of the method

`l4-best`/`original-best` require `--baseline /path/to/training-selected-harness`. L8 external requires completed training workspaces in `loop.experience_sources`, including decisions and readable training evidence; an empty directory is not external experience. L9 requires `--components` with the appropriate training-selected prior artifacts and any required training materials. Substituting a test-peak artifact changes the information condition. Count prior search, learning calls and retries separately.

## What a reproducible record contains

Preserve configuration, task identity, environment version, initial artifact, actor/optimizer/user models, budgets, parent/adoption decisions, complete valid evaluations, final selection and its test. Record actual input/control evidence and paired repairs/regressions, not just a final percentage. Private raw requests can remain in the work directory while publishing compact metrics.

Separate candidate count, retained count, champion changes, tasks, episode repeats, per-repeat scores, validity/retries, paired repairs/regressions, model calls/tokens and wall time. Missing values remain missing. Test repeats of one artifact are not independent search runs. Incomplete historical cost data cannot establish equal-budget superiority.

Packaging changes concern command entrypoints, environment-variable connections and dependencies; strategy/scoring differences are retained. The native feedback reference is in [evolution/extensions/feedback](../evolution/extensions/feedback/README.md). Full benchmark reproduction requires new runs under matching conditions and new result records.
