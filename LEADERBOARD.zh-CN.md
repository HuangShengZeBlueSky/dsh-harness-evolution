# 已发布 Harness 多方法榜单

[English](LEADERBOARD.md) | [简体中文](LEADERBOARD.zh-CN.md)

![多方法榜单](assets/leaderboard.zh-CN.png)

| 场景 | 裸模型 | ALIGN | AgentSquare | Meta-Harness | AHE | Life-Harness v3 | 我们 |
|---|---|---|---|---|---|---|---|
| ALFWorld | 16.51% | 28.36% | 29.36% | 35.80% | 89.00% | 88.07% | **95.41%** |
| DBBench | 44.00% | — | — | 50.30% | 57.30% | 65.00% | **70.56%** |
| WebShop | 29.50% | 18.00% | 18.50% | 42.50% | 39.00% | 45.50% | **47.00%** |
| OSBench | 21.50% | — | — | 25.70% | 37.50% | 39.60% | **38.89%** |
| τ²-Telecom | 25.83% | — | — | 50.80% | 95.00% | 90.00% | **84.17%** |

主表“我们”展示已发布、已晋升检查点的完整测试最高值，可能来自回溯补测。训练最终选定版单独保留如下；回溯高分不是新的独立盲测。

## 训练最终版与最佳已测晋升点

| 场景 | 训练最终版最高 | 最佳已测晋升点 | 发布依据 |
|---|---|---|---|
| ALFWorld | [v18 · 95.41%](harnesses/alfworld/20261026-method1-sol61-v18) | [v18 · 95.41%](harnesses/alfworld/20261026-method1-sol61-v18) | 训练最终版 |
| DBBench | [v35 · 70.56%](harnesses/dbbench/20261026-l4-h0-sol61-v35) | [v35 · 70.56%](harnesses/dbbench/20261026-l4-h0-sol61-v35) | 训练最终版 |
| WebShop | [v28 · 44.50%](harnesses/webshop/20261026-l5-h0-sol61-v28) | [v12 · 47.00%](harnesses/webshop/20261027-original-best-sol61-v12) | 回溯补测 |
| OSBench | [v17 · 38.89%](harnesses/osbench/20261026-l4-h0-sol61-v17) | [v17 · 38.89%](harnesses/osbench/20261026-l4-h0-sol61-v17) | 训练最终版 |
| τ²-Telecom | [v06 · 84.17%](harnesses/telecom/20261026-start-luna-repaired-v06) | [v06 · 84.17%](harnesses/telecom/20261026-start-luna-repaired-v06) | 训练最终版 |

**来源与口径：**其他方法数值由 Life-Harness 作者在论文中报告，并非我们的复测。Meta-Harness、AHE 来自表 1；裸模型、Life-Harness 使用表 10；ALIGN、AgentSquare 来自表 11。保留原文精度；缺失值不是零。

论文 Meta-Harness、AHE、Life-Harness 均采用 GPT-5.5 优化六轮；我们的优化器与轮数不同。论文 AgentBench 每题一次，我们每题三次。ALIGN 使用其发布划分。Telecom 还存在用户模拟器、账户事实接口与额外复核调用的差异，因此不将这些数值合成一个严格公平排名。

<!-- TELECOM-HISTORY:START -->

## Telecom：历史水位与当前产物

![Telecom 新旧版本对照](assets/telecom-history.zh-CN.png)

**相对 v1/v2 的报告值，我们的成功率高 26.67 个百分点，三次全成功率高 32.50 个百分点。**新版 v3 仍并列展示；这是跨报告的数值差，不是同协议因果增益。

| 版本 / 产物 | 日期 | Pass@1 | Pass@3 至少一次 | Pass³ 三次全成功 |
|---|---|---:|---:|---:|
| [Life-Harness v1](https://arxiv.org/html/2605.22166v1) | 2026-05-21 | 57.50% | 87.50% | 30.00% |
| [Life-Harness v2](https://arxiv.org/html/2605.22166v2) | 2026-05-27 | 57.50% | 87.50% | 30.00% |
| [Life-Harness v3](https://arxiv.org/html/2605.22166v3) | 2026-10-15 | 90.00% | 100.00% | 77.50% |
| [我们 · v06](harnesses/telecom/20261026-start-luna-repaired-v06/README.zh-CN.md) | 2026-10-26 | **84.17%** | **100.00%** | **62.50%** |

来源：[v1 表 7](https://arxiv.org/html/2605.22166v1)、[v2 表 8](https://arxiv.org/html/2605.22166v2)、[v3 表 10](https://arxiv.org/html/2605.22166v3)。均取 Qwen3-4B 行，不混入 18 模型均值。旧新版论文均使用 DeepSeek-V4-Flash 用户模型；我们使用 GLM-5.3-Flash，另有账户事实与额外复核接口，不能直接归因于 loop。

<!-- TELECOM-HISTORY:END -->

## 每种方法做什么

| 方法 | 简明思路 |
|---|---|
| 裸模型 | 冻结做题模型，不添加进化后的 harness。 |
| ALIGN | 为智能体生成环境交互接口。 |
| AgentSquare | 搜索模块化智能体架构。 |
| Meta-Harness | 结合历史代码、分数和轨迹搜索 harness 程序。 |
| AHE | 修改 harness 组件文件，通过评测检验改动是否产生预期效果。 |
| Life-Harness v3 | 围绕交互生命周期的四层结构进化干预机制。 |
| 我们 | 基于 DSH 的插件进化：先维护当前能力结构，再针对问题类设计插件并评测采用。 |

## Telecom 稳定性与 WebShop 平均奖励

| 指标 | Bare | Meta-Harness | AHE | Life-Harness | 我们 |
|---|---:|---:|---:|---:|---:|
| Pass@3 · 至少一次成功 | 47.50% | — | — | 100.00% | 100.00% |
| Pass³ · 三次全成功 | 7.50% | 40.00% | 87.50% | 77.50% | 62.50% |

WebShop 当前产物平均奖励为 **71.21/100**；主榜使用严格成功率，两者不混排。

## 演化成本：百万 token

| 场景 | Meta-Harness | AHE | Life-Harness | 我们 |
|---|---:|---:|---:|---:|
| ALFWorld | 37 | 96 | 24 | 未汇总 |
| DBBench | 33 | 105 | 11 | 未汇总 |
| WebShop | 37 | 104 | 38 | 未汇总 |
| OSBench | 27 | 94 | 26 | 未汇总 |
| τ²-Telecom | 21 | 88 | 43 | 未汇总 |

论文成本为表 1 的取整值；我们的成本缺失不等于零，不据此声称更省。ALIGN 和 AgentSquare 未在该表报告演化成本。

## 本地复测水位

| 场景 | 本地裸模型 | 本地 Life-Harness full | 当前产物 |
|---|---:|---:|---:|
| ALFWorld | 13.46% | 87.77% | 95.41% |
| DBBench | 43.56% | 64.11% | 70.56% |
| WebShop | 28.00% | — | 47.00% |
| OSBench | 33.33% | 36.81% | 38.89% |
| τ²-Telecom | 43.33% | — | 84.17% |

## 全部已发布产物

| 场景 | 产物 | 成功率 | 比较组 | 发布日期 |
|---|---|---:|---|---|
| ALFWorld | [20261026-method1-sol61-v18](harnesses/alfworld/20261026-method1-sol61-v18/README.zh-CN.md) | 95.41% | 主榜组 · 训练最终版 | 2026-10-26 |
| DBBench | [20261026-l4-h0-sol61-v35](harnesses/dbbench/20261026-l4-h0-sol61-v35/README.zh-CN.md) | 70.56% | 主榜组 · 训练最终版 | 2026-10-26 |
| DBBench | [20261027-l4-h0-sol61-v32](harnesses/dbbench/20261027-l4-h0-sol61-v32/README.zh-CN.md) | 70.33% | 主榜组 · 回溯补测 | 2026-10-27 |
| OSBench | [20261026-l4-h0-sol61-v17](harnesses/osbench/20261026-l4-h0-sol61-v17/README.zh-CN.md) | 38.89% | 主榜组 · 训练最终版 | 2026-10-26 |
| OSBench | [20261027-l5-h0-sol61-v08](harnesses/osbench/20261027-l5-h0-sol61-v08/README.zh-CN.md) | 38.66% | 主榜组 · 回溯补测 | 2026-10-27 |
| τ²-Telecom | [20261026-start-luna-repaired-v06](harnesses/telecom/20261026-start-luna-repaired-v06/README.zh-CN.md) | 84.17% | 主榜组 · 训练最终版 | 2026-10-26 |
| WebShop | [20261027-original-best-sol61-v12](harnesses/webshop/20261027-original-best-sol61-v12/README.zh-CN.md) | 47.00% | 主榜组 · 回溯补测 | 2026-10-27 |
| WebShop | [20261026-l5-h0-sol61-v28](harnesses/webshop/20261026-l5-h0-sol61-v28/README.zh-CN.md) | 44.50% | 主榜组 · 训练最终版 | 2026-10-26 |

[论文原文与数值来源](https://arxiv.org/html/2605.22166v3) · [结构化对照数据](results/paper-baselines.json) · [English protocol notes](docs/METRICS.md)


主榜只在已登记的同组评测条件内选最高分；不同模型或协议的产物保留在版本表，不自动替换主榜。
