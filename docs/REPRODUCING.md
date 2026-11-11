# Reproduction

[简体中文](REPRODUCING.zh-CN.md)

Use Python 3.10–3.12 for full benchmark environments and Node.js 22.19+. Install with **python -m pip install -e evolution**.

## Configuration families

| Family | Path | Purpose |
|---|---|---|
| L4 | configs/l4 | Historical capability-guided plugin search |
| A/B/C | configs/abc | 40-round controlled edit-scope search |
| Data coverage | Each C-sol61-narrow profile | Same C controller, alternate training coverage |
| Historical ALFWorld | configs/artifacts/alfworld-sol61-20 | 20 rounds, six 50-task batches |
| Historical WebShop L5 | configs/artifacts/webshop-l5-h0-sol61 | 240 train + 60 validation, strict-success selection |
| Historical WebShop continuation | configs/artifacts/webshop-original-best-sol61 | 300 tasks, inherited starting plugins |

A/B/C contains A and B for four high-effort improvers, plus Sol-high C and its data arm, in four benchmarks. The paper's nine-panel plots show three improvers with historical C selections. See the [curve mapping](../paper/data/curve-manifest.json).

## Environment inputs

| Benchmark | Required assets and variables | Model-call cap |
|---|---|---:|
| ALFWorld | ALFWorld 0.4.2, TextWorld 1.7.0, spaCy 3.7.5, NumPy 1.26.4; official game files; ALFWORLD_DATA_ROOT | 50 |
| DBBench | MySQL 8.4, mysql-connector-python; data/db_out_new.jsonl and data/standard.jsonl; MYSQL_PASSWORD | 15 |
| WebShop | Matching product/goal files and frozen catalog webshop-fixed-stage2-20261102; reset/step/close service; WEBSHOP_URL | 20 |
| OSBench | Docker, os-evolve task images, fixtures/train and fixtures/test; DOCKER_HOST | 16 |

Set BENCH_BASE_URL and, when needed, BENCH_API_KEY. DBBench also uses BENCH_CHAT_URL and BENCH_TOKENIZER_URL. Model identity, decoder settings, task lists and budgets remain in YAML.

The repository includes exact task IDs and inherited WebShop plugins. Large benchmark assets and hosted model access are supplied separately. Obtain the original frozen WebShop snapshot from the experiment owner when reproducing its reported catalog; regenerated prices change the condition.

## Search

~~~bash
dsh-evolve profiles
dsh-evolve init ./runs/db-c --profile abc/dbbench/C-sol61 --assets /data/dbbench
dsh-evolve setup ./runs/db-c/experiment.yaml
dsh-evolve run ./runs/db-c/experiment.yaml
dsh-evolve status ./runs/db-c/experiment.yaml
~~~

Use **l4/dbbench-l4-h0-sol61** for L4. Rerunning run resumes completed decisions and valid cached evaluations. A/B/C samples up to eight failed and four successful traces, then requests one structured replacement and rationale. It compares matching task/trial/seed outcomes and promotes on strict metric gain, visible editable-hook output change, and nondecreasing validation when configured.

A edits skill text. B replaces one of skill, memory, action checking or receipt interpretation. C can replace a composition whose mechanisms share episode state. B components retain independent state.

ALFWorld, DBBench and WebShop cycle six batches of 50. OSBench uses 80 training and 20 validation tasks. Narrow arms use the first two batches; OSBench substitutes another 80-task set with the same validation set. Training/validation seed is 42, test trials use 42–44; only OSBench forwards the seed to the actor. WebShop selects by mean reward and reports strict success.

After 40 decisions, A/B/C seals the final parent and tests promoted versions three times. Error bars are sample standard deviations. Historical recipes preserve original schedules; ALFWorld's initial test manifest has 109 episodes, with later repeated-checkpoint evaluations in paper data.

## Frozen artifacts

Initialize a fresh workspace with a compatible profile and **--baseline /path/to/released-harness**, run setup, then:

~~~bash
dsh-evolve test-artifact ./runs/artifact-check/experiment.yaml
~~~

This evaluates the loaded artifact on the profile's held-out tasks. Telecom uses [its two-role integration](../integrations/telecom/) and GLM user, with its settings in the released protocol.

## Installation check

~~~bash
python evolution/scripts/smoke.py /tmp/dsh-install-check
~~~

The scripted actor and synthetic task exercise real DSH hooks, L4/A/B/C, promotion/rejection, sealing and held-out execution. No paid model requests are used. This packaging check passed; full benchmark searches were not rerun during cleanup.

Prior methods remain at **archive/pre-paper-cleanup-20261111**. [Publication updates](PUBLISHING.md) use versioned numeric records.
