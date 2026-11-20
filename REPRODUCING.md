# Reproducing HookEvo

## Evaluate a released checkpoint

Install the project in editable mode from this checkout as described in the [README](README.md#installation). Choose a benchmark and prepare its dependencies below. Set BENCH_BASE_URL to the OpenAI-compatible inference endpoint for Qwen3-4B-Instruct-2507 and BENCH_API_KEY if the service requires one.

| Benchmark | External environment | Additional settings |
| --- | --- | --- |
| ALFWorld | Install the ALFWorld Python extra and the official ALFWorld game files. | Set ALFWORLD_DATA_ROOT to the directory containing the train and valid_unseen game directories. |
| DBBench | Install the DBBench Python extra. Supply MySQL 8.4 and an asset directory with data/db_out_new.jsonl and data/standard.jsonl. | Set MYSQL_PASSWORD, BENCH_CHAT_URL (chat completions) and BENCH_TOKENIZER_URL (token count). Check the MySQL host and port in the profile. |
| WebShop | Supply a running WebShop reset/step/close service with the original product catalog and goals. The paper used webshop-fixed-stage2-20261102. | Set WEBSHOP_URL to the service URL. Use the prices and goals from that catalog for the paper evaluation. |
| OSBench | Supply Docker, the matching os-evolve task images and an asset directory containing fixtures/test and, for search, fixtures/train. | Set DOCKER_HOST, BENCH_CHAT_URL and BENCH_TOKENIZER_URL. |

Install benchmark-specific Python extras with `python -m pip install -e 'evolution[alfworld]'` or `python -m pip install -e 'evolution[dbbench]'`. The checked-in benchmark source subsets provide the DBBench and OSBench grading implementations.

The released DBBench harness achieved **70.56% mean success** over three trials on 300 held-out tasks. To evaluate it, run the following from the repository root.

~~~bash
dsh-evolve init ./runs/db-eval --profile frozen/dbbench --assets /data/dbbench
dsh-evolve setup ./runs/db-eval/experiment.yaml
dsh-evolve test-artifact ./runs/db-eval/experiment.yaml
~~~

Substitute frozen/alfworld, frozen/webshop, or frozen/osbench to load the corresponding checkpoint. The init command copies the checkpoint into the new workspace and installs the matching environment adapter. Supply --assets when the benchmark needs a local data or fixtures directory. Run setup once per workspace. The test command prints each trial's success percentage, their mean and sample standard deviation. Per-episode records are written to runs/evaluations/baseline/test/episodes.jsonl inside the workspace. Here baseline denotes the supplied frozen checkpoint.

For each trial, success is the percentage of held-out tasks that receive a native score of 1. In WebShop, this counts fully successful purchases. The reported mean and sample SD summarize three trials of the same harness.

Each artifact includes an evaluation.json record with the original run identifier, the headline checkpoint, round-level training measurements, and the measured test checkpoints. Training and test scores are percentages. Each value in `repeat_rates` is a fraction.

## Run a controlled search

To run a new DBBench search with GPT-6.1 Sol, use `abc/dbbench/C-sol61`. In scope C, the improver can update handlers and their shared state in one proposal. Authenticate the Codex CLI for the configured improver. Run `dsh-evolve profiles` to list the available search and evaluation profiles.

~~~bash
dsh-evolve init ./runs/db-search --profile abc/dbbench/C-sol61 --assets /data/dbbench
dsh-evolve setup ./runs/db-search/experiment.yaml
dsh-evolve run ./runs/db-search/experiment.yaml
~~~

Resume the same run with the last command. Inspect runs/optimizer for the rendered prompt and proposal, runs/decisions for each parent/candidate comparison, and runs/training-seal.json for the selected parent and held-out targets. These paths are relative to the experiment workspace.

## Search runs behind the released harnesses

| Benchmark | Search that produced the released harness | Run record |
| --- | --- | --- |
| ALFWorld | Fixed training pool, 40 rounds | [ALFWorld history](artifacts/alfworld/evaluation.json) |
| DBBench | L4 search initialized at H0 | [DBBench history](artifacts/dbbench/evaluation.json) |
| WebShop | Second search stage initialized with plugins from the first | [WebShop history](artifacts/webshop/evaluation.json) |
| OSBench | Scope C search on the narrow training pool | [OSBench history](artifacts/osbench/evaluation.json) |

## Code map

| Paper component | Implementation |
| --- | --- |
| Trajectory sampling, proposal format, paired comparison, and retention | [abc.py](evolution/src/dsh_evolve/abc.py) |
| Independent slots and shared-state composition | [Scope A/B](evolution/src/dsh_evolve/assets/slot-ab.mjs), [scope C](evolution/src/dsh_evolve/assets/slot-c.mjs) |
| Task schedules, seeds, model settings, and budgets | [Search profiles](configs/abc), [frozen evaluation profiles](configs/frozen) |
| Evaluation records, cached runs, and plugin loading | [Project](evolution/src/astra_evolve/project.py), [records](evolution/src/astra_evolve/records.py) |
| Environment execution | [Benchmark runners](evolution/src/dsh_evolve/runners) and [scoring sources](evolution/benchmark_sources) |
