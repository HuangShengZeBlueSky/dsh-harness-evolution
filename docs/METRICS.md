# Metrics and comparison scope

## Definitions

- **Pass@1 / success:** fraction of successful episodes. Our four AgentBench records average three evaluations of each task.
- **WebShop strict success:** reward exactly 1. Partial rewards contribute to **mean reward**, reported separately on a 0–100 scale.
- **Pass@3:** fraction of Telecom tasks with at least one success across the three recorded trials.
- **Pass³:** fraction of Telecom tasks successful in all three recorded trials. It is not Pass@3.
- **Evolution tokens:** measured optimization token usage. Life-Harness Table 1 reports rounded units of ten million. Our campaign-wide aggregate is unavailable in this initial release and is shown as missing, not zero.

## Sources

Paper references are from [Life-Harness v3, Tables 1 and 10](https://arxiv.org/html/2605.22166v3), dated 2026-10-15. The corresponding [official implementation](https://github.com/Tianshi-Xu/Life-Harness) is separately credited. Author-reported waterlines, local baseline/full measurements, and our released artifacts remain separate columns.

| Benchmark | Our task count × repeats | Material comparison detail |
|---|---|---|
| ALFWorld | 109 × 3 | Standardized final remeasurement; 50 model calls/actions, fixed task games and native scoring. The paper uses one trial. Local full uses the retrieved published implementation. |
| DBBench | 300 × 3 | MySQL 8.4.11 environment, 15 model calls; paper uses one trial. |
| WebShop | 200 × 3 | 99,995 indexed products / 1,021 goals; paper uses one trial. Different-catalog historical means are excluded from the current local-full column. |
| OSBench | 144 × 3 | Isolated AgentBench OS tasks, 16 model calls; paper uses one trial. |
| τ²-Telecom | 40 × 3 | Our GLM-5.3-Flash user differs from the paper's DeepSeek-V4-Flash user. Our historical bridge also exposes selected account facts and performs auxiliary review calls. |

Each artifact's `protocol.json` records its measured actor, budgets, environment, starting point, and selection policy. An optimizer named Sol or Luna is not the benchmark actor; the actor remains Qwen3-4B-Instruct-2507.

## Reading the leaderboard

The published champion is the highest **success score among released, completed final artifacts** for that benchmark. Comparing final artifacts across experiments is retrospective selection using test scores; it does not produce a new untouched test result. Ties retain an existing record unless a later release is explicitly added.

The numerical gap to the paper is descriptive. Different trial counts, starting points, development budgets, simulator models, runtime access, and auxiliary-call budgets prevent treating every gap as a controlled method comparison. In particular, Telecom is a separate protocol lane, even where task names match.

Local bare and Life-Harness-full columns preserve our measured reference waterlines. ALFWorld's standardized comparison is paired to the published implementation; DBBench/OSBench values are local reference runs, not universal author scores. WebShop and Telecom have no aligned local-full entry in this release. Their missing value is intentional.

## Reading evolution curves

The development panel shows actual candidate training and selected validation values. Rotating training batches are not a single fixed evaluation set. WebShop's development panel displays mean reward, while strict success determines its L5 adoption and leaderboard ranking. The test panel displays only actually measured checkpoints; it never fills unmeasured intermediate checkpoints with synthetic scores. Earlier Telecom/ALFWorld histories include historical checkpoint tests; newer L4/L5 runs test only the final selected checkpoint.

The first publication packages completed evaluation artifacts. Portable import paths and local runtime paths were adjusted for release; the published package has been checked for loading, but these scores are not claimed to come from a fresh public-package rerun.
