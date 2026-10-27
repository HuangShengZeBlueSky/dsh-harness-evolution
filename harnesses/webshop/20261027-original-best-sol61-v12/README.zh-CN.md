# WebShop · v12

[English](README.md) | **简体中文**

**产物说明：**两个协同插件分别维护检索证据与规格选择记录。从旧方法1最终版 v37 续跑，v12 回溯补测严格成功率达47.00%；原晋升目标是平均奖励，并非严格成功率。

**发布依据：**回溯补测选出的已晋升检查点；原实验训练选定最终版为 v36。

| 测试成功率 | 本次发布检查点 | 插件注册项 | 测试覆盖 |
|---:|---|---:|---|
| **47.00%** | v12 / 40 轮预算 | 2 | 200 题 × 3 遍 |

做题模型：**Qwen3-4B-Instruct-2507**；优化模型：**Sol 6.1 high**；方法：**方法1协同 · 旧最佳续跑**。

[**插件源码**](plugins) · [**运行配置**](protocol.json) · [**插件装配**](composition.json) · [**全部产物**](../../../README.zh-CN.md)

## 方法流程图

```mermaid
flowchart TD
    A["旧方法1最终版v37"]
    B["分析检索与规格选择失败"]
    C["至少两个插件产生有效协同修改"]
    D["父版与候选使用同批50道训练题"]
    E["平均奖励提升且改动真实生效"]
    F["冻结训练选定最终版v36"]
    A --> B
    B --> C
    C --> D
    D --> E
    E -->|采用或拒绝后继续| B
    E -->|预算结束| F
    F --> T["最终版测试"]
    E --> K["已晋升检查点归档"]
    K -.-> R["独立回溯补测：不回传优化器"]
    R --> P["本次发布 v12"]
    classDef release fill:#e3f5ef,stroke:#0c7968,color:#145b4b
    class P release
```

## 结构框图

下图展示运行时结构和插件职责；模块名保留源码英文名称，便于对应实现。

```mermaid
flowchart TD
    U[Visible user requirement and page] --> P[Visible-state parsing helpers]
    P --> S[search-evidence: identity, features, price]
    P --> O[option-ledger: real variant selections]
    R[Shared resume-policy helpers] --> S
    R --> O
    S --> A[DSH prompt and episode state]
    O --> A
    A --> Q[Frozen Qwen3-4B]
    Q --> G[Native pre-execute checks]
    G --> E[WebShop search / click / buy]
    E --> F[Real page receipts]
    F --> P
    E --> J[External benchmark scoring]
```

## 进化曲线

![真实记录的进化曲线](evolution.png)

上图为候选训练成绩和已采用版本的验证成绩；下图仅显示实际测过的测试点。训练批次可能轮换，曲线上下波动不等于固定测试集能力下降。WebShop L5 展示严格成功率；原方法协同续跑按平均奖励晋升，开发曲线保留平均奖励。测试排名统一看严格成功率。菱形标记采用记录，竖线标记发布检查点。灰线是论文各方法在该场景报告的最高数值，只作参考。

[曲线数据](curve.json) · [完整插件职责表](README.md#plugin-inventory) · [多方法榜单](../../../LEADERBOARD.zh-CN.md)

## 使用产物

在仓库根目录安装依赖后启动：

```bash
npm install
MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs harnesses/webshop/20261027-original-best-sol61-v12
```

该命令启动 harness 运行时。基准环境、任务数据和做题模型服务另行提供。[运行说明](../../../docs/RUNNING.zh-CN.md)

## 评测口径

成绩来自原实验的完整有效测试，不是发布后重新评测。发布依据已在页首明确标注；回溯补测发现的候选不会改写原实验最终选择，也不是新的独立盲测。插件数量是实现登记数，不代表每个插件都已单独证明有收益。
