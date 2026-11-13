# Test leaderboard

Values follow the paper snapshot dated 2026-11-13.

| Method | ALFWorld | DBBench | WebShop | OSBench |
|---|---|---|---|---|
| Ours: Sol high (measured peak) | 95.41 ± 0.00 | 70.56 ± 0.38 | 48.17 ± 0.29 | 41.67 ± 1.84 |
| Life-Harness (local) | 87.77 ± 1.91 | 64.11 ± 0.38 | 41.33 ± 0.29 | 36.81 ± 0.00 |
| Life-Harness (v3) | 88.07 | 65.00 | 45.50 | 39.60 |
| Bare | 16.51 | 44.00 | 29.50 | 21.50 |
| ALIGN | 28.36 | — | 18.00 | — |
| AgentSquare | 29.36 | — | 18.50 | — |
| Meta-Harness (Life rerun) | 35.80 | 50.30 | 42.50 | 25.70 |
| AHE (Life rerun) | 89.00 | 57.30 | 39.00 | 37.50 |
| Harness-R1 (paper) | 29.10 | 55.70 | 38.60 | — |

All values are test success percentages. ± denotes sample standard deviation across repeated executions.
The current manuscript covers four benchmarks. Headline values are measured test peaks.
The previous five-benchmark table is preserved in paper/data/main-results-20261111.json.

[Configurations](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/blob/main/docs/REPRODUCING.md) · [Figures and source data](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/paper/README.md)

## Released harnesses

- [alfworld · 20261026-method1-sol61-v18](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/alfworld/20261026-method1-sol61-v18)
- [dbbench · 20261026-l4-h0-sol61-v35](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/dbbench/20261026-l4-h0-sol61-v35)
- [dbbench · 20261027-l4-h0-sol61-v32](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/dbbench/20261027-l4-h0-sol61-v32)
- [osbench · 20261026-l4-h0-sol61-v17](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/osbench/20261026-l4-h0-sol61-v17)
- [osbench · 20261027-l5-h0-sol61-v08](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/osbench/20261027-l5-h0-sol61-v08)
- [osbench · 20261030-l4-h0-sol61-v03](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/osbench/20261030-l4-h0-sol61-v03)
- [telecom · 20261026-start-luna-repaired-v06](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/telecom/20261026-start-luna-repaired-v06)
- [webshop · 20261026-l5-h0-sol61-v28](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/webshop/20261026-l5-h0-sol61-v28)
- [webshop · 20261027-original-best-sol61-v12](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/tree/main/harnesses/webshop/20261027-original-best-sol61-v12)
