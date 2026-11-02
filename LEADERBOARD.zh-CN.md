# 统一主表：性能、模型、数据来源与优化预算

| Method | Executor | Source | Rounds | ALFWorld | DBBench | WebShop | OSBench | Telecom |
|---|---|---|---:|---:|---:|---:|---:|---:|
| **Qwen3-4B：论文报告与本方法** | | | | | | | | |
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
| **论文报告 · 其他执行模型** | | | | | | | | |
| SkillOpt | GPT-5.5 | P-S | — | 95.50 | — | — | — | — |
| GEPA (SkillOpt evaluation) | GPT-5.5 | P-S | — | 85.80 | — | — | — | — |
| TextGrad (SkillOpt evaluation) | GPT-5.5 | P-S | — | 82.80 | — | — | — | — |
| HarnessX | Qwen3.5-9B | P2 | — | 97.00 | — | 49.00 | — | — |
| GEPA-Curator / Gemini | gpt-oss-120b | P* | — | 91.80 ± 1.40 | — | — | — | — |
| GEPA-Curator / Claude | gpt-oss-120b | P* | — | 98.40 ± 0.60 | — | — | — | — |
| **共同执行模型实测 · Qwen3-4B** | | | | | | | | |
| Life-Harness (released) | Qwen3-4B | M | — | 87.77 ± 1.91 | 64.11 ± 0.38 | — | 36.81 ± 0.00 | 57.50 ± 9.01 |
| ALIGN (released) | Qwen3-4B | M | — | 3.36 ± 1.06 | — | 评测中 | — | — |
| ReAct | Qwen3-4B | M | — | 10.70 ± 1.06 | — | — | — | — |
| ReflAct | Qwen3-4B | M | — | 18.35 ± 1.83 | — | — | — | — |
| AutoManual | Qwen3-4B | M | — | 76.15 ± 1.59 | — | — | — | — |
| Harness-R1 (released patch) | Qwen3-4B | M | — | — | 评测中 | — | — | — |
| **共同冻结环境 · WebShop** | | | | | | | | |
| Life-Harness | Qwen3-4B | F | — | — | — | 评测中 | — | — |
| ALIGN | Qwen3-4B | F | — | — | — | 评测中 | — | — |
| Our framework / checkpoint A | Qwen3-4B | F | — | — | — | 评测中 | — | — |
| Our framework / checkpoint B | Qwen3-4B | F | — | — | — | 评测中 | — | — |
| **待适配或待资源的相关方法** | | | | | | | | |
| ExpeL | Qwen3-4B | Q | — | 待适配 | — | 待适配 | — | — |
| AgentSquare (local) | Qwen3-4B | Q | — | 待适配 | — | 待适配 | — | — |
| Verify–Backtrack Loop | Qwen3-4B | Q | — | 待适配 | — | — | — | — |
| GEPA-Curator (local) | Qwen3-4B | Q | — | 待适配 | — | — | — | — |
| SkillFM (local) | Qwen3-4B | Q | — | 缺权重 | — | 缺权重 | — | — |

每格先列成功率及可用标准差，再列累计优化Token（百万）。P-L：Life-Harness论文适配对照；P-S：SkillOpt论文评测；P*：原文划分；P2：进化集峰值pass@2；M：本地测量；H：历史释放产物；F：共同冻结WebShop环境；Q：待适配或资源。不同分组保留各自协议。
