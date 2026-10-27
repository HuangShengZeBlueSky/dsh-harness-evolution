# τ²-Telecom · v06

[English](README.md) | **简体中文**

**产物说明：**客户线路身份、设备诊断、账单与账户复核

**发布依据：**训练选定的最终检查点。

| 测试成功率 | 本次发布检查点 | 插件注册项 | 测试覆盖 |
|---:|---|---:|---|
| **84.17%** | v06 / 8 轮预算 | 35 | 40 题 × 3 遍 |

做题模型：**Qwen3-4B-Instruct-2507**；优化模型：**Sol high**；方法：**方法2消融 · Luna修复版起点**。

[**插件源码**](plugins) · [**运行配置**](protocol.json) · [**插件装配**](composition.json) · [**全部产物**](../../../README.zh-CN.md)

## 方法流程图

```mermaid
flowchart TD
    A["Luna修复起点v02"]
    B["分析训练轨迹及已有原生组件"]
    C["修改原生插件与装配"]
    D["配对训练评测：74题乘3遍"]
    E["训练成功率提升"]
    F["记录历史逐版测试：40题乘3遍"]
    A --> B
    B --> C
    C --> D
    D --> E
    E -->|采用或拒绝后继续| B
    E -->|预算结束| F
    E --> K["已晋升检查点归档"]
    K -.-> R["独立回溯补测：不回传优化器"]
    F --> P["本次发布 v06"]
    classDef release fill:#e3f5ef,stroke:#0c7968,color:#145b4b
    class P release
```

## 结构框图

下图展示运行时结构和插件职责；模块名保留源码英文名称，便于对应实现。

```mermaid
flowchart TD
    O[Visible task and observations]
    S[DSH system prompt and state]
    M[Frozen Qwen3 4B actor]
    T[Native tool execution hooks]
    X[Benchmark environment and real receipts]
    A["Inherited prompt + 13 tool descriptions"]
    B["13 tool schemas + 2 result processors"]
    C["Structured quota/refuel memory"]
    D["Identity + receipts + device"]
    E["Contract + payment"]
    F["Account-facts adapter + auxiliary review"]
    O --> A
    O --> D
    X --> B
    X --> C
    A --> S
    B --> S
    C --> S
    D --> S
    E --> S
    X --> F
    F --> S
    S --> M
    M --> T
    T --> X
    X --> O
    classDef plugin fill:#e8f0ff,stroke:#3861d8,color:#142c55
    class A,B,C,D,E,F plugin
```

## 进化曲线

![真实记录的进化曲线](evolution.png)

上图为候选训练成绩和已采用版本的验证成绩；下图仅显示实际测过的测试点。训练批次可能轮换，曲线上下波动不等于固定测试集能力下降。WebShop L5 展示严格成功率；原方法协同续跑按平均奖励晋升，开发曲线保留平均奖励。测试排名统一看严格成功率。菱形标记采用记录，竖线标记发布检查点。灰线是论文各方法在该场景报告的最高数值，只作参考。

[曲线数据](curve.json) · [完整插件职责表](README.md#plugin-inventory) · [多方法榜单](../../../LEADERBOARD.zh-CN.md)

## 使用产物

在仓库根目录安装依赖后启动：

```bash
npm install
MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs harnesses/telecom/20261026-start-luna-repaired-v06
```

该命令启动 harness 运行时。基准环境、任务数据和做题模型服务另行提供。[运行说明](../../../docs/RUNNING.zh-CN.md)

## 评测口径

成绩来自原实验的完整有效测试，不是发布后重新评测。发布依据已在页首明确标注；回溯补测发现的候选不会改写原实验最终选择，也不是新的独立盲测。插件数量是实现登记数，不代表每个插件都已单独证明有收益。

Telecom 使用 GLM-5.3-Flash 用户模拟器，并包含账户事实适配与额外复核调用；与论文对照存在协议差异。30 个继承表面组件加 5 个定制插件，不等于 35 类独立创新机制。

**为什么发布 v06 而不是历史测试峰值？**v05 历史测试为 87.50%，但训练选定的最终版是 v06（84.17%）。这里保留实验最终选择，不用测试峰值倒选替代。八个新增候选为 v03 至 v10，起点为 v02。
