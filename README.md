# DSH Harness Evolution

[English](README.md) · [简体中文](README.zh-CN.md)

**Trajectory-guided harness evolution on DeepSeek Harness.**

[Leaderboard & curves](https://huangshengzebluesky.github.io/dsh-harness-evolution/?lang=en) · [Reproduce](docs/REPRODUCING.md) · [Paper figures](paper/README.md) · [Test results](LEADERBOARD.md)

Freeze the executor and evolve its harness. The mainline contains two methods.

| Method | What changes | Entry |
|---|---|---|
| L4 | Describe current capabilities and plugin responsibilities, then propose and evaluate native plugin edits | [Code](evolution/src/dsh_evolve/loops/l4.py) · [Configurations](configs/l4) |
| A/B/C | A edits skill text; B edits one independent component; C coordinates hooks through episode state | [Controller](evolution/src/dsh_evolve/abc.py) · [40 configurations](configs/abc) |

![A/B/C search](paper/previews/abc-search-procedure.png)

## Paper results

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

These are the paper's historical artifact lineages. ALFWorld uses 20 rounds, DBBench/OSBench include L4, and WebShop includes a historical continuation. The separate OSBench C data-control peak of 41.67% remains in the figure archive. [Exact settings](docs/REPRODUCING.md) · [Full comparisons](LEADERBOARD.md).

Matched 40-round A/B/C final selections have their own [data](paper/data/controlled-abc.json) and website table.

## Curves and figures

Each of four benchmarks has an **eight-panel C model/effort plot** and a **nine-panel model-by-scope plot**. The 27 figures from the writing document and the aligned A/B/C algorithm are included.

[28 figures](paper/README.md) · [Figure-to-configuration mapping](paper/data/curve-manifest.json) · [Training and measured tests](paper/data/trajectories.json)

## Run

~~~bash
python -m pip install -e evolution
dsh-evolve profiles
dsh-evolve init ./runs/db-c --profile abc/dbbench/C-sol61 --assets /data/dbbench
# Set model and database environment variables as described in the guide.
dsh-evolve setup ./runs/db-c/experiment.yaml
dsh-evolve run ./runs/db-c/experiment.yaml
~~~

A/B/C seals the final selection before testing promoted checkpoints. [Environment setup and artifact evaluation](docs/REPRODUCING.md).

## Repository

- [evolution](evolution/) contains shared execution, L4 and A/B/C.
- [configs](configs/) contains L4, A/B/C and historical artifact recipes.
- [harnesses](harnesses/) contains five-benchmark artifacts, compositions and diagrams.
- [paper](paper/) contains figure PDFs, tables and numeric records.
- [tools](tools/) builds the website and publishes measurements.

Earlier methods remain in [Git history](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/archive/pre-paper-cleanup-20261111). [Publishing](docs/PUBLISHING.md) rebuilds the leaderboard from canonical paper data.

[MIT](LICENSE) · [Third-party notices](docs/THIRD_PARTY.md) · [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
