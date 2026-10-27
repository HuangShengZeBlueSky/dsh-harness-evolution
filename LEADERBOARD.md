# Published harnesses · multi-method leaderboard

[English](LEADERBOARD.md) | [简体中文](LEADERBOARD.zh-CN.md)

![Multi-method leaderboard](assets/leaderboard.png)

| Benchmark | Bare | ALIGN | AgentSquare | Meta-Harness | AHE | Life-Harness v3 | Ours |
|---|---|---|---|---|---|---|---|
| ALFWorld | 16.51% | 28.36% | 29.36% | 35.80% | 89.00% | 88.07% | **95.41%** |
| DBBench | 44.00% | — | — | 50.30% | 57.30% | 65.00% | **70.56%** |
| WebShop | 29.50% | 18.00% | 18.50% | 42.50% | 39.00% | 45.50% | **47.00%** |
| OSBench | 21.50% | — | — | 25.70% | 37.50% | 39.60% | **38.89%** |
| τ²-Telecom | 25.83% | — | — | 50.80% | 95.00% | 90.00% | **84.17%** |

The Ours column shows the highest complete test score among published promoted checkpoints, including retrospective releases. Training-selected final artifacts remain separate below; a retrospective high score is not a fresh independent test.

## Training-final artifacts versus best measured promoted checkpoints

| Benchmark | Best training-final artifact | Best measured promoted checkpoint | Release basis |
|---|---|---|---|
| ALFWorld | [v18 · 95.41%](harnesses/alfworld/20261026-method1-sol61-v18) | [v18 · 95.41%](harnesses/alfworld/20261026-method1-sol61-v18) | Training final |
| DBBench | [v35 · 70.56%](harnesses/dbbench/20261026-l4-h0-sol61-v35) | [v35 · 70.56%](harnesses/dbbench/20261026-l4-h0-sol61-v35) | Training final |
| WebShop | [v28 · 44.50%](harnesses/webshop/20261026-l5-h0-sol61-v28) | [v12 · 47.00%](harnesses/webshop/20261027-original-best-sol61-v12) | Retrospective |
| OSBench | [v17 · 38.89%](harnesses/osbench/20261026-l4-h0-sol61-v17) | [v17 · 38.89%](harnesses/osbench/20261026-l4-h0-sol61-v17) | Training final |
| τ²-Telecom | [v06 · 84.17%](harnesses/telecom/20261026-start-luna-repaired-v06) | [v06 · 84.17%](harnesses/telecom/20261026-start-luna-repaired-v06) | Training final |

**Provenance:** other-method scores are reported by the Life-Harness authors, not measured by us. Meta-Harness/AHE: Table 1; bare/Life-Harness: Table 10; ALIGN/AgentSquare: Table 11. Published precision is retained; missing is not zero.

The paper evolves Meta-Harness, AHE and Life-Harness for six rounds with GPT-5.5. Our optimizer and budgets differ. Paper AgentBench uses one trial; ours uses three. ALIGN uses its released split. Telecom also differs in user simulator, account-facts access and auxiliary review. The table is a reference comparison, not a controlled overall ranking.

<!-- TELECOM-HISTORY:START -->

## Telecom: historical waterlines and our release

![Telecom historical and current references](assets/telecom-history.png)

**Our Pass@1 is 26.67 pp higher than the v1/v2 report; all-three success is 32.50 pp higher.** The newer v3 result remains visible. These are cross-report numerical differences, not matched-protocol causal gains.

| Version / artifact | Date | Pass@1 | Pass@3 at least one | Pass³ all three |
|---|---|---:|---:|---:|
| [Life-Harness v1](https://arxiv.org/html/2605.22166v1) | 2026-05-21 | 57.50% | 87.50% | 30.00% |
| [Life-Harness v2](https://arxiv.org/html/2605.22166v2) | 2026-05-27 | 57.50% | 87.50% | 30.00% |
| [Life-Harness v3](https://arxiv.org/html/2605.22166v3) | 2026-10-15 | 90.00% | 100.00% | 77.50% |
| [Ours · v06](harnesses/telecom/20261026-start-luna-repaired-v06) | 2026-10-26 | **84.17%** | **100.00%** | **62.50%** |

Sources: [v1 Table 7](https://arxiv.org/html/2605.22166v1), [v2 Table 8](https://arxiv.org/html/2605.22166v2), [v3 Table 10](https://arxiv.org/html/2605.22166v3). These are Qwen3-4B rows, not the 18-model averages. Both old and new papers use DeepSeek-V4-Flash users; ours uses GLM-5.3-Flash plus account-facts/review integration. Differences cannot be attributed to the loop alone.

<!-- TELECOM-HISTORY:END -->

## What each method does

| Method | Approach |
|---|---|
| Bare | Frozen actor without an evolved harness. |
| ALIGN | Generates an environment interface for the agent. |
| AgentSquare | Searches modular agent architectures. |
| Meta-Harness | Searches harness programs using previous code, scores, and traces. |
| AHE | Edits harness files and checks expected effects in evaluations. |
| Life-Harness v3 | Evolves interventions across four interaction lifecycle layers. |
| Ours | Evolve DSH plugins after mapping current capabilities; assign problem-class responsibilities and evaluate adoption. |

## Telecom reliability and WebShop mean reward

| Metric | Bare | Meta-Harness | AHE | Life-Harness | Ours |
|---|---:|---:|---:|---:|---:|
| Pass@3 · at least one success | 47.50% | — | — | 100.00% | 100.00% |
| Pass³ · all three succeed | 7.50% | 40.00% | 87.50% | 77.50% | 62.50% |

Current WebShop mean reward is **71.21/100**; the main table ranks strict success, not partial reward.

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
| WebShop | 28.00% | — | 47.00% |
| OSBench | 33.33% | 36.81% | 38.89% |
| τ²-Telecom | 43.33% | — | 84.17% |

## All published artifacts

| Benchmark | Artifact | Success | Comparison | Published |
|---|---|---:|---|---|
| ALFWorld | [20261026-method1-sol61-v18](harnesses/alfworld/20261026-method1-sol61-v18) | 95.41% | Primary · Training final | 2026-10-26 |
| DBBench | [20261026-l4-h0-sol61-v35](harnesses/dbbench/20261026-l4-h0-sol61-v35) | 70.56% | Primary · Training final | 2026-10-26 |
| DBBench | [20261027-l4-h0-sol61-v32](harnesses/dbbench/20261027-l4-h0-sol61-v32) | 70.33% | Primary · Retrospective | 2026-10-27 |
| OSBench | [20261026-l4-h0-sol61-v17](harnesses/osbench/20261026-l4-h0-sol61-v17) | 38.89% | Primary · Training final | 2026-10-26 |
| OSBench | [20261027-l5-h0-sol61-v08](harnesses/osbench/20261027-l5-h0-sol61-v08) | 38.66% | Primary · Retrospective | 2026-10-27 |
| τ²-Telecom | [20261026-start-luna-repaired-v06](harnesses/telecom/20261026-start-luna-repaired-v06) | 84.17% | Primary · Training final | 2026-10-26 |
| WebShop | [20261027-original-best-sol61-v12](harnesses/webshop/20261027-original-best-sol61-v12) | 47.00% | Primary · Retrospective | 2026-10-27 |
| WebShop | [20261026-l5-h0-sol61-v28](harnesses/webshop/20261026-l5-h0-sol61-v28) | 44.50% | Primary · Training final | 2026-10-26 |

[Paper and numerical sources](https://arxiv.org/html/2605.22166v3) · [Structured comparison data](results/paper-baselines.json) · [English protocol notes](docs/METRICS.md)


Primary champions are selected only within registered comparison groups. Other actors/protocols remain in the release table without automatically replacing the primary champion.
