# Published harness leaderboard

Updated by release, with prior artifacts retained. Actor: Qwen3-4B-Instruct-2507. Ranking uses success, not WebShop partial reward.

| Benchmark | Released artifact | Ours Pass@1 | Life-Harness paper | Numerical gap |
|---|---|---:|---:|---:|
| ALFWorld | [v18 · 方法2 · Astra自由方案](harnesses/alfworld/20261026-method1-sol61-v18) | **95.41%** | 88.07% | +7.34 pp |
| DBBench | [v35 · L4 · Agent结构与多插件职责](harnesses/dbbench/20261026-l4-h0-sol61-v35) | **70.56%** | 65.00% | +5.56 pp |
| WebShop | [v28 · L5 · 场景专用循环](harnesses/webshop/20261026-l5-h0-sol61-v28) | **44.50%** | 45.50% | -1.00 pp |
| OSBench | [v17 · L4 · Agent结构与多插件职责](harnesses/osbench/20261026-l4-h0-sol61-v17) | **38.89%** | 39.60% | -0.71 pp |
| τ²-Telecom | [v06 · 方法2消融 · Luna修复版起点](harnesses/telecom/20261026-start-luna-repaired-v06) | **84.17%** | 90.00% | -5.83 pp |

Updated from published release records. Numerical differences are descriptive, not protocol-matched superiority claims.

## Waterlines: sources kept separate

| Benchmark | Paper bare | Paper Life-Harness | Local bare | Local Life-Harness full | Published best |
|---|---:|---:|---:|---:|---:|
| ALFWorld | 16.51% | 88.07% | 13.46% | 87.77% | 95.41% |
| DBBench | 44.00% | 65.00% | 43.56% | 64.11% | 70.56% |
| WebShop | 29.50% | 45.50% | 28.00% | — | 44.50% |
| OSBench | 21.50% | 39.60% | 33.33% | 36.81% | 38.89% |
| τ²-Telecom | 25.83% | 90.00% | 43.33% | — | 84.17% |

— means not available in the aligned local record, not zero. Local references are measurements in our environment, not author claims. Their detailed protocol comparability is described in [metrics](docs/METRICS.md).

## Additional metrics

| Benchmark | Metric | Ours | Life-Harness paper |
|---|---|---:|---:|
| WebShop | Mean reward / 100 | 70.68 | Not reported in main comparison |
| τ²-Telecom | Pass@3: at least one of three | 100.00% | 100.00% |
| τ²-Telecom | Pass³: all three | 62.50% | 77.50% |

## Evolution cost

| Benchmark | Our evolution tokens | Paper Life-Harness evolution tokens |
|---|---:|---:|
| ALFWorld | Not consolidated | 24 million |
| DBBench | Not consolidated | 11 million |
| WebShop | Not consolidated | 38 million |
| OSBench | Not consolidated | 26 million |
| τ²-Telecom | Not consolidated | 43 million |

Paper costs are rounded from Table 1. Our missing aggregate is not zero; no efficiency advantage is claimed.

## All published versions

| Benchmark | Release | Checkpoint | Pass@1 | Mean reward / 100 | Date |
|---|---|---|---:|---:|---|
| ALFWorld | [20261026-method1-sol61-v18](harnesses/alfworld/20261026-method1-sol61-v18) | v18 | 95.41% | — | 2026-10-26 |
| DBBench | [20261026-l4-h0-sol61-v35](harnesses/dbbench/20261026-l4-h0-sol61-v35) | v35 | 70.56% | — | 2026-10-26 |
| OSBench | [20261026-l4-h0-sol61-v17](harnesses/osbench/20261026-l4-h0-sol61-v17) | v17 | 38.89% | — | 2026-10-26 |
| τ²-Telecom | [20261026-start-luna-repaired-v06](harnesses/telecom/20261026-start-luna-repaired-v06) | v06 | 84.17% | — | 2026-10-26 |
| WebShop | [20261026-l5-h0-sol61-v28](harnesses/webshop/20261026-l5-h0-sol61-v28) | v28 | 44.50% | 70.68 | 2026-10-26 |

Sources: [Life-Harness paper, Tables 1 and 10](https://arxiv.org/html/2605.22166v3), [official implementation](https://github.com/Tianshi-Xu/Life-Harness), and this repository’s [release records](results).
