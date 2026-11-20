# Reproducing HookEvo

## Evaluate a released checkpoint

Install the project in editable mode from this checkout as described in the [README](README.md#installation). Choose a benchmark and prepare its dependencies below. Set BENCH_BASE_URL to the OpenAI-compatible inference endpoint for Qwen3-4B-Instruct-2507 and BENCH_API_KEY if the service requires one.

| Benchmark | External environment | Additional settings |
| --- | --- | --- |
| ALFWorld | Install the ALFWorld Python extra and the official ALFWorld game files. | Set ALFWORLD_DATA_ROOT to the directory containing the train and valid_unseen game directories. |
| DBBench | Install the DBBench Python extra. Supply MySQL 8.4 and an asset directory with data/db_out_new.jsonl and data/standard.jsonl. | Set MYSQL_PASSWORD, BENCH_CHAT_URL (chat completions) and BENCH_TOKENIZER_URL (token count). Check the MySQL host and port in the profile. |
| WebShop | Supply a running WebShop reset/step/close service with the original product catalog and goals. The paper used webshop-fixed-stage2-20261102. | Set WEBSHOP_URL to the service URL. The frozen catalog is distributed separately. Regenerating prices changes the evaluation. |
| OSBench | Supply Docker, the matching os-evolve task images and an asset directory containing fixtures/test and, for search, fixtures/train. | Set DOCKER_HOST, BENCH_CHAT_URL and BENCH_TOKENIZER_URL. |

Install benchmark-specific Python extras with `python -m pip install -e 'evolution[alfworld]'` or `python -m pip install -e 'evolution[dbbench]'`. The checked-in benchmark source subsets provide the DBBench and OSBench grading implementations. Model endpoints, datasets, task images, and benchmark services must be provisioned separately.

For example, once DBBench is ready, run the following from the repository root.

~~~bash
dsh-evolve init ./runs/db-eval --profile frozen/dbbench --assets /data/dbbench
dsh-evolve setup ./runs/db-eval/experiment.yaml
dsh-evolve test-artifact ./runs/db-eval/experiment.yaml
~~~

Substitute frozen/alfworld, frozen/webshop, or frozen/osbench to load the corresponding checkpoint. The init command copies the checkpoint into the new workspace and installs the matching environment adapter. Supply --assets when the benchmark needs a local data or fixtures directory. Run setup once per workspace. The test command prints each trial's success percentage, their mean and sample standard deviation. Per-episode records are written to runs/evaluations/baseline/test/episodes.jsonl inside the workspace. Here baseline denotes the supplied frozen checkpoint.

Success is the fraction of held-out tasks reaching native score 1 in each complete trial. WebShop partial rewards count as failures for this metric. The three trials measure execution variability for one fixed harness. Variation across independent searches requires separate search runs.

Each artifact includes an evaluation.json record with the original run identifier, the headline checkpoint, round-level training measurements, and the measured test checkpoints. Training and test scores are percentages; individual repeat_rates are fractions.

## Run a controlled search

The search additionally requires the Codex CLI authenticated for the improver model in the selected profile. The benchmark executor and the improver use separate model configurations. List the available profiles with dsh-evolve profiles.

~~~bash
dsh-evolve init ./runs/db-search --profile abc/dbbench/C-sol61 --assets /data/dbbench
dsh-evolve setup ./runs/db-search/experiment.yaml
dsh-evolve run ./runs/db-search/experiment.yaml
~~~

Resume the same run with the last command. Inspect runs/optimizer for the rendered prompt and proposal, runs/decisions for each parent/candidate comparison, and runs/training-seal.json for the selected parent and held-out targets. These paths are relative to the experiment workspace.

The controlled A/B/C profiles rerun the edit-scope search. The headline checkpoints also draw on earlier search protocols. ALFWorld v06 came from a fixed-pool 40-round run, DBBench v35 from the L4 run starting at H0, WebShop v12 from a continuation with inherited plugins, and OSBench v01 from the narrow C training pool. A new search can produce different programs. Use the frozen profiles to evaluate the paper's specific programs.

## Code map

| Paper component | Implementation |
| --- | --- |
| Trajectory sampling, proposal format, paired comparison, and retention | [abc.py](evolution/src/dsh_evolve/abc.py) |
| Independent slots and shared-state composition | [Scope A/B](evolution/src/dsh_evolve/assets/slot-ab.mjs), [scope C](evolution/src/dsh_evolve/assets/slot-c.mjs) |
| Task schedules, seeds, model settings, and budgets | [Search profiles](configs/abc), [frozen evaluation profiles](configs/frozen) |
| Evaluation records, cached runs, and plugin loading | [Project](evolution/src/astra_evolve/project.py), [records](evolution/src/astra_evolve/records.py) |
| Environment execution | [Benchmark runners](evolution/src/dsh_evolve/runners) and [scoring sources](evolution/benchmark_sources) |
