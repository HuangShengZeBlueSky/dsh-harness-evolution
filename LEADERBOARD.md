# Published harnesses · multi-method leaderboard

[English](LEADERBOARD.md) | [简体中文](LEADERBOARD.zh-CN.md)

![Multi-method leaderboard](assets/leaderboard.png)

| Benchmark | Bare | ALIGN | AgentSquare | Meta-Harness | AHE | Life-Harness | Ours |
|---|---|---|---|---|---|---|---|
| ALFWorld | 16.51% | 28.36% | 29.36% | 35.80% | 89.00% | 88.07% | **95.41%** |
| DBBench | 44.00% | — | — | 50.30% | 57.30% | 65.00% | **70.56%** |
| WebShop | 29.50% | 18.00% | 18.50% | 42.50% | 39.00% | 45.50% | **44.50%** |
| OSBench | 21.50% | — | — | 25.70% | 37.50% | 39.60% | **38.89%** |
| τ²-Telecom | 25.83% | — | — | 50.80% | 95.00% | 90.00% | **84.17%** |

**Provenance:** other-method scores are reported by the Life-Harness authors, not measured by us. Meta-Harness/AHE: Table 1; bare/Life-Harness: Table 10; ALIGN/AgentSquare: Table 11. Published precision is retained; missing is not zero.

The paper evolves Meta-Harness, AHE and Life-Harness for six rounds with GPT-5.5. Our optimizer and budgets differ. Paper AgentBench uses one trial; ours uses three. ALIGN uses its released split. Telecom also differs in user simulator, account-facts access and auxiliary review. The table is a reference comparison, not a controlled overall ranking.

## What each method does

| Method | Approach |
|---|---|
| Bare | Frozen actor without an evolved harness. |
| ALIGN | Generates an environment interface for the agent. |
| AgentSquare | Searches modular agent architectures. |
| Meta-Harness | Searches harness programs using previous code, scores, and traces. |
| AHE | Edits harness files and checks expected effects in evaluations. |
| Life-Harness | Evolves interventions across four interaction lifecycle layers. |
| Ours | Evolve DSH plugins after mapping current capabilities; assign problem-class responsibilities and evaluate adoption. |

## Telecom reliability and WebShop mean reward

| Metric | Bare | Meta-Harness | AHE | Life-Harness | Ours |
|---|---:|---:|---:|---:|---:|
| Pass@3 · at least one success | 47.50% | — | — | 100.00% | 100.00% |
| Pass³ · all three succeed | 7.50% | 40.00% | 87.50% | 77.50% | 62.50% |

Current WebShop mean reward is **70.68/100**; the main table ranks strict success, not partial reward.

## Evolution cost · million tokens

| Benchmark | Meta-Harness | AHE | Life-Harness | Ours |
|---|---:|---:|---:|---:|
| ALFWorld | 37 | 96 | 24 | Not consolidated |
| DBBench | 33 | 105 | 11 | Not consolidated |
| WebShop | 37 | 104 | 38 | Not consolidated |
| OSBench | 27 | 94 | 26 | Not consolidated |
| τ²-Telecom | 21 | 88 | 43 | Not consolidated |

Paper costs are rounded values from Table 1. Missing local cost is not zero; no efficiency advantage is claimed. ALIGN/AgentSquare evolution costs are not reported in that table.

## Local measured waterlines

| Benchmark | Local bare | Local Life-Harness full | Current artifact |
|---|---:|---:|---:|
| ALFWorld | 13.46% | 87.77% | 95.41% |
| DBBench | 43.56% | 64.11% | 70.56% |
| WebShop | 28.00% | — | 44.50% |
| OSBench | 33.33% | 36.81% | 38.89% |
| τ²-Telecom | 43.33% | — | 84.17% |

## All published artifacts

| Benchmark | Artifact | Success | Published |
|---|---|---:|---|
| ALFWorld | [20261026-method1-sol61-v18](harnesses/alfworld/20261026-method1-sol61-v18) | 95.41% | 2026-10-26 |
| DBBench | [20261026-l4-h0-sol61-v35](harnesses/dbbench/20261026-l4-h0-sol61-v35) | 70.56% | 2026-10-26 |
| OSBench | [20261026-l4-h0-sol61-v17](harnesses/osbench/20261026-l4-h0-sol61-v17) | 38.89% | 2026-10-26 |
| τ²-Telecom | [20261026-start-luna-repaired-v06](harnesses/telecom/20261026-start-luna-repaired-v06) | 84.17% | 2026-10-26 |
| WebShop | [20261026-l5-h0-sol61-v28](harnesses/webshop/20261026-l5-h0-sol61-v28) | 44.50% | 2026-10-26 |

[Paper and numerical sources](https://arxiv.org/html/2605.22166v3) · [Structured comparison data](results/paper-baselines.json) · [English protocol notes](docs/METRICS.md)
