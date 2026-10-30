# Research artifacts / 各方法最终产物

**44个实际最终选定检查点：三场景L1–L9及续跑36组，加已完整终测的新反馈8组。** 它们用于比较方法生成了什么，不全部作为榜单冠军发布。五场景精选发布版仍在 [harnesses](../harnesses/)。

44 actual final selections: 36 L1–L9/continuation runs across three benchmarks and eight completed feedback runs. These support method comparison; they are not all leaderboard champions. Curated five-benchmark releases remain under `harnesses/`.

每组包含冻结插件、组合、必要本地依赖、静态挂接框图，并通过同一run ID连接[进化曲线与统计](../results/research/runs.json)、配置与任务身份。虚线表示源码挂接，不构成独立机制收益证据。没有发布原始对话轨迹、依赖缓存或机器凭据。

Each artifact includes frozen plugins, composition, necessary local dependencies and a static attachment diagram. The same run ID connects to evolution points, statistics, configuration and task identities. Dashed source edges are not independent mechanism evidence. Raw conversations, dependency caches and machine credentials are excluded.

[Machine-readable index / 结构化索引](index.json) · [Method recipes / 方法配方](../docs/METHODS.zh-CN.md) · [Reproduction / 复现](../docs/REPRODUCING.zh-CN.md)

| Benchmark | Method / 方法 | Checkpoint / 产物 | Final test |
|---|---|---|---:|
| dbbench | L1：验证门槛 · `l1-sol61` | [v20](loop-comparison-20r-20261025/dbbench/l1-sol61/v20/README.md) | 54.33% |
| dbbench | L2：固定子集回放 · `l2-sol61` | [v26](loop-comparison-20r-20261025/dbbench/l2-sol61/v26/README.md) | 61.22% |
| dbbench | L3：三个分支 · `l3-sol61` | [v25](loop-comparison-20r-20261025/dbbench/l3-sol61/v25/README.md) | 58.56% |
| osbench | L1：验证门槛 · `l1-sol61` | [v31](loop-comparison-20r-20261025/osbench/l1-sol61/v31/README.md) | 32.64% |
| osbench | L2：固定子集回放 · `l2-sol61` | [v18](loop-comparison-20r-20261025/osbench/l2-sol61/v18/README.md) | 28.94% |
| osbench | L3：三个分支 · `l3-sol61` | [v16](loop-comparison-20r-20261025/osbench/l3-sol61/v16/README.md) | 35.88% |
| webshop | L1：验证门槛 · `l1-sol61` | [v20](loop-comparison-20r-20261025/webshop/l1-sol61/v20/README.md) | 37.17% |
| webshop | L2：固定子集回放 · `l2-sol61` | [v31](loop-comparison-20r-20261025/webshop/l2-sol61/v31/README.md) | 34.17% |
| webshop | L3：三个分支 · `l3-sol61` | [v17](loop-comparison-20r-20261025/webshop/l3-sol61/v17/README.md) | 39.83% |
| dbbench | L4：已有最佳起点 · `l4-best-sol61` | [v38](loop-expansion-sol40-20261026/dbbench/l4-best-sol61/v38/README.md) | 62.44% |
| dbbench | L4：插件能力结构 · `l4-h0-sol61` | [v35](loop-expansion-sol40-20261026/dbbench/l4-h0-sol61/v35/README.md) | 70.56% |
| dbbench | L5：场景化目标与验证 · `l5-h0-sol61` | [v38](loop-expansion-sol40-20261026/dbbench/l5-h0-sol61/v38/README.md) | 66.56% |
| dbbench | 旧方法续跑 · `original-best-sol61` | [v40](loop-expansion-sol40-20261026/dbbench/original-best-sol61/v40/README.md) | 62.22% |
| osbench | L4：已有最佳起点 · `l4-best-sol61` | [v40](loop-expansion-sol40-20261026/osbench/l4-best-sol61/v40/README.md) | 37.27% |
| osbench | L4：插件能力结构 · `l4-h0-sol61` | [v17](loop-expansion-sol40-20261026/osbench/l4-h0-sol61/v17/README.md) | 38.89% |
| osbench | L5：场景化目标与验证 · `l5-h0-sol61` | [v11](loop-expansion-sol40-20261026/osbench/l5-h0-sol61/v11/README.md) | 38.19% |
| osbench | 旧方法续跑 · `original-best-sol61` | [v38](loop-expansion-sol40-20261026/osbench/original-best-sol61/v38/README.md) | 35.65% |
| webshop | L4：已有最佳起点 · `l4-best-sol61` | [v28](loop-expansion-sol40-20261026/webshop/l4-best-sol61/v28/README.md) | 42.00% |
| webshop | L4：插件能力结构 · `l4-h0-sol61` | [v40](loop-expansion-sol40-20261026/webshop/l4-h0-sol61/v40/README.md) | 40.83% |
| webshop | L5：场景化目标与验证 · `l5-h0-sol61` | [v28](loop-expansion-sol40-20261026/webshop/l5-h0-sol61/v28/README.md) | 44.50% |
| webshop | 旧方法续跑 · `original-best-sol61` | [v36](loop-expansion-sol40-20261026/webshop/original-best-sol61/v36/README.md) | 44.33% |
| dbbench | L6：先计划后编码 · `l6-h0-sol61` | [v37](loop-l6-attribution-40r-20261026/dbbench/l6-h0-sol61/v37/README.md) | 56.22% |
| osbench | L6：先计划后编码 · `l6-h0-sol61` | [v40](loop-l6-attribution-40r-20261026/osbench/l6-h0-sol61/v40/README.md) | 29.40% |
| webshop | L6：先计划后编码 · `l6-h0-sol61` | [v30](loop-l6-attribution-40r-20261026/webshop/l6-h0-sol61/v30/README.md) | 39.83% |
| dbbench | L7：失败覆盖与场景验证 · `l7-sol61` | [v18](loop-l789-sol40-20261026/dbbench/l7-sol61/v18/README.md) | 49.67% |
| dbbench | L8：外部经验 · `l8-external-sol61` | [v40](loop-l789-sol40-20261026/dbbench/l8-external-sol61/v40/README.md) | 60.33% |
| dbbench | L8：轮内经验 · `l8-internal-sol61` | [v19](loop-l789-sol40-20261026/dbbench/l8-internal-sol61/v19/README.md) | 43.67% |
| dbbench | L9：组件选择与组装 · `l9-sol61` | [v08](loop-l789-sol40-20261026/dbbench/l9-sol61/v08/README.md) | 67.44% |
| osbench | L7：失败覆盖与场景验证 · `l7-sol61` | [v32](loop-l789-sol40-20261026/osbench/l7-sol61/v32/README.md) | 31.71% |
| osbench | L8：外部经验 · `l8-external-sol61` | [v10](loop-l789-sol40-20261026/osbench/l8-external-sol61/v10/README.md) | 32.41% |
| osbench | L8：轮内经验 · `l8-internal-sol61` | [v10](loop-l789-sol40-20261026/osbench/l8-internal-sol61/v10/README.md) | 30.09% |
| osbench | L9：组件选择与组装 · `l9-sol61` | [v32](loop-l789-sol40-20261026/osbench/l9-sol61/v32/README.md) | 38.19% |
| webshop | L7：失败覆盖与场景验证 · `l7-sol61` | [v15](loop-l789-sol40-20261026/webshop/l7-sol61/v15/README.md) | 36.50% |
| webshop | L8：外部经验 · `l8-external-sol61` | [v40](loop-l789-sol40-20261026/webshop/l8-external-sol61/v40/README.md) | 34.33% |
| webshop | L8：轮内经验 · `l8-internal-sol61` | [v37](loop-l789-sol40-20261026/webshop/l8-internal-sol61/v37/README.md) | 35.50% |
| webshop | L9：组件选择与组装 · `l9-sol61` | [v25](loop-l789-sol40-20261026/webshop/l9-sol61/v25/README.md) | 43.33% |
| dbbench | 摘要反馈 · `dsh-summary` | [v40](failure-frontier-fivebench-20261029/dbbench/dsh-summary/v40/README.md) | 55.44% |
| dbbench | 问题机制反馈 · `dsh-mechanism` | [v37](failure-frontier-fivebench-20261029/dbbench/dsh-mechanism/v37/README.md) | 55.78% |
| webshop | 摘要反馈 · `dsh-summary` | [v40](failure-frontier-fivebench-20261029/webshop/dsh-summary/v40/README.md) | 39.00% |
| webshop | 问题机制反馈 · `dsh-mechanism` | [v35](failure-frontier-fivebench-20261029/webshop/dsh-mechanism/v35/README.md) | 42.33% |
| osbench | 摘要反馈 · `dsh-summary` | [v39](failure-frontier-fivebench-20261029/osbench/dsh-summary/v39/README.md) | 29.40% |
| osbench | 问题机制反馈 · `dsh-mechanism` | [v39](failure-frontier-fivebench-20261029/osbench/dsh-mechanism/v39/README.md) | 32.87% |
| alfworld | 摘要反馈 · `dsh-summary` | [v18](failure-frontier-fivebench-20261029/alfworld/dsh-summary/v18/README.md) | 95.41% |
| alfworld | 问题机制反馈 · `dsh-mechanism` | [v17](failure-frontier-fivebench-20261029/alfworld/dsh-mechanism/v17/README.md) | 94.50% |

WebShop uses strict purchase success; other benchmarks use task success. Final feedback ALFWorld tests have109 episodes, unlike the327-episode repeats of earlier selected artifacts. Telecom feedback is incomplete and has no entry in this final-selection archive.

WebShop列为严格购买成功率；新反馈ALFWorld为109场，不与历史选定产物的327场复测混为同一覆盖。Telecom新反馈尚未最终测试，未放入这个最终产物目录。
