# Unified main comparison: performance, models, provenance and optimization budget

| Method | Executor | Source | Rounds | ALFWorld | DBBench | WebShop | OSBench | Telecom |
|---|---|---|---:|---:|---:|---:|---:|---:|
| **Qwen3-4B: literature and our framework** | | | | | | | | |
| Bare | Qwen3-4B | P-L | — | 16.51 | 44.00 | 29.50 | 21.50 | 25.83 |
| ALIGN | Qwen3-4B | P-L | — | 28.36 | — | 18.00 | — | — |
| AgentSquare | Qwen3-4B | P-L | — | 29.36 | — | 18.50 | — | — |
| Meta-Harness | Qwen3-4B | P-L | 6 | 35.80 / 37.14M | 50.30 / 32.81M | 42.50 / 36.74M | 25.70 / 26.79M | 50.80 / 21.32M |
| AHE | Qwen3-4B | P-L | 6 | 89.00 / 95.63M | 57.30 / 104.52M | 39.00 / 103.84M | 37.50 / 93.99M | 95.00 / 88.35M |
| Life-Harness v3 | Qwen3-4B | P-L | 6 | 88.07 / 24.29M | 65.00 / 11.20M | 45.50 / 37.75M | 39.60 / 25.71M | 90.00 / 42.64M |
| SkillFM* | Qwen3-4B | P* | — | 77.01 | — | 14.60 | — | — |
| Life-Harness v1/v2 | Qwen3-4B | P-v1/2 | — | — | — | — | — | 57.50 |
| Harness-R1 | Qwen3-4B | P* | — | 29.10 | 55.70 | 38.60 | — | — |
| Our framework | Qwen3-4B | H | 8–40 | 95.41 ± 0.00 / 27.86M | 70.56 ± 0.38 / 127.07M | 47.00 ± 0.87 / 116.97M | 39.35 ± 2.12 / 26.02M | 84.17 ± 10.10 |
| **Paper reports · other executors** | | | | | | | | |
| SkillOpt | GPT-5.5 | P-S | — | 95.50 | — | — | — | — |
| GEPA (SkillOpt evaluation) | GPT-5.5 | P-S | — | 85.80 | — | — | — | — |
| TextGrad (SkillOpt evaluation) | GPT-5.5 | P-S | — | 82.80 | — | — | — | — |
| HarnessX | Qwen3.5-9B | P2 | — | 97.00 | — | 49.00 | — | — |
| GEPA-Curator / Gemini | gpt-oss-120b | P* | — | 91.80 ± 1.40 | — | — | — | — |
| GEPA-Curator / Claude | gpt-oss-120b | P* | — | 98.40 ± 0.60 | — | — | — | — |
| **Local measurements · Qwen3-4B** | | | | | | | | |
| Life-Harness (released) | Qwen3-4B | M | — | 87.77 ± 1.91 | 64.11 ± 0.38 | — | 36.81 ± 0.00 | 57.50 ± 9.01 |
| ALIGN (released) | Qwen3-4B | M | — | 3.36 ± 1.06 | — | Running | — | — |
| ReAct | Qwen3-4B | M | — | 10.70 ± 1.06 | — | — | — | — |
| ReflAct | Qwen3-4B | M | — | 18.35 ± 1.83 | — | — | — | — |
| AutoManual | Qwen3-4B | M | — | 76.15 ± 1.59 | — | — | — | — |
| Harness-R1 (released patch) | Qwen3-4B | M | — | — | Running | — | — | — |
| **Common frozen environment · WebShop** | | | | | | | | |
| Life-Harness | Qwen3-4B | F | — | — | — | Running | — | — |
| ALIGN | Qwen3-4B | F | — | — | — | Running | — | — |
| Our framework / checkpoint A | Qwen3-4B | F | — | — | — | Running | — | — |
| Our framework / checkpoint B | Qwen3-4B | F | — | — | — | Running | — | — |
| **Related methods awaiting adapters or resources** | | | | | | | | |
| ExpeL | Qwen3-4B | Q | — | Pending | — | Pending | — | — |
| AgentSquare (local) | Qwen3-4B | Q | — | Pending | — | Pending | — | — |
| Verify–Backtrack Loop | Qwen3-4B | Q | — | Pending | — | — | — | — |
| GEPA-Curator (local) | Qwen3-4B | Q | — | Pending | — | — | — | — |
| SkillFM (local) | Qwen3-4B | Q | — | Weights needed | — | Weights needed | — | — |

Cells give success and available SD, then cumulative optimizer tokens in millions. P-L: Life-Harness adaptation; P-S: SkillOpt evaluation; P*: original split; P2: adaptation-set peak pass@2; M: local measurement; H: historical release; F: common frozen WebShop environment; Q: pending adapter/resources. Each group retains its protocol.
