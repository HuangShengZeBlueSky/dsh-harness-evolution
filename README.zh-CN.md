# DSH Harness Evolution

[English](README.md) | **简体中文**

**五个场景，多种方法对照，可直接查看的插件产物。**

基于 DSH 的 harness 进化，固定 Qwen3-4B 做题模型。每个产物包含插件源码、运行接口、Mermaid 框图、真实进化曲线和测试配置。

[**完整榜单**](LEADERBOARD.zh-CN.md) · [**进化曲线**](docs/CURVES.zh-CN.md) · [**方法概览**](docs/METHOD.zh-CN.md) · [**下载全部产物**](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/archive/refs/heads/main.zip)

![多方法成绩总览](assets/leaderboard.zh-CN.png)

榜单包含裸模型、ALIGN、AgentSquare、Meta-Harness、AHE、Life-Harness 和我们。其他方法使用论文报告值，不是我们重跑的结果；缺失的场景留空。

## 选择 Harness 产物

| 场景与成绩 | 解决的问题 | 检查点 | 直接查看 |
|---|---|---|---|
| **ALFWorld · 95.41%** | 家务任务流程与可见状态指导 | [v18 · 2 个注册项](harnesses/alfworld/20261026-method1-sol61-v18/README.zh-CN.md) | [源码](harnesses/alfworld/20261026-method1-sol61-v18/plugins) · [框图](harnesses/alfworld/20261026-method1-sol61-v18/README.zh-CN.md#结构框图) · [曲线](harnesses/alfworld/20261026-method1-sol61-v18/README.zh-CN.md#进化曲线) |
| **DBBench · 70.56%** | 数据库结构与取值对齐、SQL 执行和结果提交 | [v35 · 8 个注册项](harnesses/dbbench/20261026-l4-h0-sol61-v35/README.zh-CN.md) | [源码](harnesses/dbbench/20261026-l4-h0-sol61-v35/plugins) · [框图](harnesses/dbbench/20261026-l4-h0-sol61-v35/README.zh-CN.md#结构框图) · [曲线](harnesses/dbbench/20261026-l4-h0-sol61-v35/README.zh-CN.md#进化曲线) |
| **WebShop · 44.50%** | 商品检索、规格选择、价格核验与购买 | [v28 · 5 个注册项](harnesses/webshop/20261026-l5-h0-sol61-v28/README.zh-CN.md) | [源码](harnesses/webshop/20261026-l5-h0-sol61-v28/plugins) · [框图](harnesses/webshop/20261026-l5-h0-sol61-v28/README.zh-CN.md#结构框图) · [曲线](harnesses/webshop/20261026-l5-h0-sol61-v28/README.zh-CN.md#进化曲线) |
| **OSBench · 38.89%** | 文件检查、命令语义、全局统计与重复恢复 | [v17 · 5 个注册项](harnesses/osbench/20261026-l4-h0-sol61-v17/README.zh-CN.md) | [源码](harnesses/osbench/20261026-l4-h0-sol61-v17/plugins) · [框图](harnesses/osbench/20261026-l4-h0-sol61-v17/README.zh-CN.md#结构框图) · [曲线](harnesses/osbench/20261026-l4-h0-sol61-v17/README.zh-CN.md#进化曲线) |
| **τ²-Telecom · 84.17%** | 客户线路身份、设备诊断、账单与账户复核 | [v06 · 35 个注册项](harnesses/telecom/20261026-start-luna-repaired-v06/README.zh-CN.md) | [源码](harnesses/telecom/20261026-start-luna-repaired-v06/plugins) · [框图](harnesses/telecom/20261026-start-luna-repaired-v06/README.zh-CN.md#结构框图) · [曲线](harnesses/telecom/20261026-start-luna-repaired-v06/README.zh-CN.md#进化曲线) |

WebShop 按严格成功率排序，平均奖励单独展示。插件注册数量不代表独立证明有效的机制数量。

## 方法概览

先维护当前 Agent 的能力和插件职责，再从训练失败中找问题类，提出插件改动，通过实际评测决定采用。允许插件协作，也允许删除重复或有副作用的指导。这里只公开方法概览和产物，不展开尚未公开的论文细节。

```mermaid
flowchart LR
    A[训练失败] --> B[当前能力与插件职责]
    B --> C[问题类与插件机制]
    C --> D[开发集评测]
    D -->|采用或修订| B
    D -->|预算结束| E[冻结检查点]
    E --> F[最终测试并发布]
```

## 后续如何更新

**新 harness＋测试数据＋进化曲线 → 发布新版本 → 自动更新中英文榜单。**

使用 `tools/publish.py` 添加产物；推送后 GitHub Actions 自动生成中英文首页总览、榜单和产物页，旧版本保留。提供新的产物和实测数据即可更新，不需要公开内部实验日志。[发布说明](docs/PUBLISHING.md) · [运行说明](docs/RUNNING.md)

## 如何理解比较

论文采用的优化模型、六轮预算和测试重复次数与我们不同；ALIGN 使用自身发布划分；Telecom 还存在用户模拟器、账户事实接口与额外复核调用的差异。主榜是来源明确的数值对照，不把所有结果包装成严格同协议排名。原始测试成绩沿用已完成实验，本次发布不代表重新跑完评测。

[MIT 许可证](LICENSE) · [致谢与第三方声明](docs/THIRD_PARTY.md)
