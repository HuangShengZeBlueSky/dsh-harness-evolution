# Test leaderboard

Values follow the paper snapshot dated 2026-11-11.

| Method | ALFWorld | DBBench | WebShop · historical | WebShop · frozen | OSBench | Telecom |
|---|---|---|---|---|---|---|
| Ours (measured peak) | 95.41 ± 0.00 | 70.56 ± 0.38 | 47.00 ± 0.87 | 48.17 ± 0.29 | 39.35 ± 2.12 | 87.50 ± 6.61 |
| Ours (selected) | 95.41 ± 0.00 | 70.56 ± 0.38 | 44.33 ± 0.29 | — | 38.89 ± 0.69 | 84.17 ± 10.10 |
| Life-Harness (local) | 87.77 ± 1.91 | 64.11 ± 0.38 | — | 41.33 ± 0.29 | 36.81 ± 0.00 | 57.50 ± 9.01 |
| ALIGN (released) | 3.36 ± 1.06 | — | — | 31.00 ± 0.50 | — | — |
| ReAct | 10.70 ± 1.06 | — | — | — | — | — |
| ReflAct | 18.35 ± 1.83 | — | — | — | — | — |
| AutoManual | 76.15 ± 1.59 | — | — | — | — | — |
| Harness-R1 (released patch) | — | 52.22 ± 0.69 | — | — | — | — |
| Life-Harness (v3) | 88.07 | 65.00 | 45.50 | — | 39.60 | 90.00 |
| Life-Harness (v1) | 88.07 | 65.00 | 45.50 | — | 39.60 | 57.50 |
| Bare | 16.51 | 44.00 | 29.50 | — | 21.50 | 25.83 |
| Prompt-evolving | 13.80 | 60.70 | 30.00 | — | 18.80 | 35.00 |
| ALIGN | 28.36 | — | 18.00 | — | — | — |
| AgentSquare | 29.36 | — | 18.50 | — | — | — |
| Meta-Harness (Life rerun) | 35.80 | 50.30 | 42.50 | — | 25.70 | 50.80 |
| AHE (Life rerun) | 89.00 | 57.30 | 39.00 | — | 37.50 | 95.00 |
| SkillFM* | 77.01 | — | 14.60 | — | — | — |
| Harness-R1 (paper) | 29.10 | 55.70 | 38.60 | — | — | — |

All values are test success percentages. ± denotes sample standard deviation across repeated executions.
Historical and frozen WebShop catalogs are separate conditions. Local Telecom uses GLM.
OSBench's historical 39.35% and the 41.67% data-control artifact have separate provenance.

[Configurations](docs/REPRODUCING.md) · [Figures and source data](paper/README.md)

## Released harnesses

- [alfworld · 20261026-method1-sol61-v18](harnesses/alfworld/20261026-method1-sol61-v18)
- [dbbench · 20261026-l4-h0-sol61-v35](harnesses/dbbench/20261026-l4-h0-sol61-v35)
- [dbbench · 20261027-l4-h0-sol61-v32](harnesses/dbbench/20261027-l4-h0-sol61-v32)
- [osbench · 20261026-l4-h0-sol61-v17](harnesses/osbench/20261026-l4-h0-sol61-v17)
- [osbench · 20261027-l5-h0-sol61-v08](harnesses/osbench/20261027-l5-h0-sol61-v08)
- [osbench · 20261030-l4-h0-sol61-v03](harnesses/osbench/20261030-l4-h0-sol61-v03)
- [telecom · 20261026-start-luna-repaired-v06](harnesses/telecom/20261026-start-luna-repaired-v06)
- [webshop · 20261026-l5-h0-sol61-v28](harnesses/webshop/20261026-l5-h0-sol61-v28)
- [webshop · 20261027-original-best-sol61-v12](harnesses/webshop/20261027-original-best-sol61-v12)
