# DSH Harness Evolution

**执行模型保持不变，进化 Harness 能让 Agent 提升多少？**

我们研究改进模型的能力和可修改空间，如何影响从执行反馈中发现的 Harness。冻结的 Qwen3-4B 负责完成任务，独立改进模型在 **DeepSeek Harness** 上更新外围插件。

[项目主页](https://huangshengzebluesky.github.io/dsh-harness-evolution/?lang=zh) · [测试结果](LEADERBOARD.zh-CN.md) · [复现方法](docs/REPRODUCING.zh-CN.md) · [产物](harnesses/) · [English](README.md)

## 方法

**观察归因 → 生成候选 → 评测选择 → 沉淀反馈。**

循环读取当前 Harness 与执行轨迹，提出可复用的修复，与父版配对评测。DSH 提供执行循环、插件生命周期、上下文组装、工具钩子和任务内状态。

![DSH上的受控进化流程](paper/previews/abc-search-procedure.png)

**L4** 是历史的能力梳理驱动进化流程，先说明当前 Agent 能力和插件职责，再提出代码修改。**A/B/C** 是修改权限的对照设计，在共同搜索流程中控制改进模型可以修改什么。

| 修改面 | 可以修改什么 |
|---|---|
| A | 技能文本 |
| B | 每轮一个独立部件，包括技能、记忆、动作检查或回执解释 |
| C | 技能，或通过任务内共享状态协调多个钩子的机制 |

[L4实现](evolution/src/dsh_evolve/loops/l4.py) · [A/B/C控制器](evolution/src/dsh_evolve/abc.py) · [实验配置](configs/)

## 最后进化出了什么？

已发布的 **DBBench L4 Harness 测试成功率为70.56%**。它的写入流程将数据库回执记录为任务状态，后续上下文向模型呈现这些事实，动作检查据此处理重复写入与过早提交。其他插件负责表结构、取值约束、结果提交和错误恢复。

![DBBench进化产物架构](paper/previews/artifact-architecture.png)

[查看Harness源码](harnesses/dbbench/20261026-l4-h0-sol61-v35/) · [执行协议](harnesses/dbbench/20261026-l4-h0-sol61-v35/protocol.json) · [实测记录](harnesses/dbbench/20261026-l4-h0-sol61-v35/evaluation.json)

## 结果与进化曲线

<!-- paper-table:start -->
| 场景 | 历史产物已测高点 | 历史最终选版 |
|---|---:|---:|
| ALFWorld | 95.41% | 95.41% |
| DBBench | 70.56% | 70.56% |
| WebShop · historical | 47.00% | 44.33% |
| WebShop · frozen | 48.17% | — |
| OSBench | 39.35% | 38.89% |
| Telecom | 87.50% | 84.17% |
<!-- paper-table:end -->

![训练与实测测试曲线](paper/previews/main-full-train-test.png)

<details>
<summary>实验配置与检查点选择</summary>

主表沿用论文的历史产物路线，已测高点与开发阶段最终选版各自保留。ALFWorld曲线为20轮，其余为40轮。WebShop区分历史与冻结商品环境，图中的从头搜索和主表的续跑也有各自记录。Telecom本地使用GLM用户模拟器。另一题单上的OSBench C高点41.67%保留在补充图表中。

同协议A/B/C搜索的[终选结果](paper/data/controlled-abc.json)单独记录。重复测试刻画同一冻结检查点的执行波动。[完整对比榜单](LEADERBOARD.zh-CN.md) · [配置对应表](paper/data/curve-manifest.json)。
</details>

## 看实验

| 研究问题 | 数据入口 |
|---|---|
| 改进模型、推理强度不同，结果怎样变化？ | [每场景8组C配置曲线](paper/README.md#多配置进化曲线) |
| 修改权限不同，结果怎样变化？ | [每场景9面板模型×修改面对照](https://huangshengzebluesky.github.io/dsh-harness-evolution/?lang=zh#curves)与[同协议A/B/C记录](paper/data/controlled-abc.json) |
| 训练数据变化，结果怎样变化？ | [C数据覆盖对照配置](configs/abc/)及实测结果 |
| 训练改善是否带来测试改善？ | [进化与后期回落分析](paper/README.md) |

四场景共 **68个曲线面板**，保留实测测试点、已有重复测试的误差，以及对应配置。[28张完整图](paper/README.md) · [逐轮数值](paper/data/trajectories.json)。

## 快速开始

按[环境说明](docs/REPRODUCING.zh-CN.md)准备Benchmark资产和模型连接，然后运行：

~~~bash
python -m pip install -e evolution
dsh-evolve init ./runs/db-c --profile abc/dbbench/C-sol61 --assets /data/dbbench
dsh-evolve setup ./runs/db-c/experiment.yaml
dsh-evolve run ./runs/db-c/experiment.yaml
~~~

- **复现历史L4搜索**，选择[configs/l4](configs/l4/)中的配置。
- **运行受控A/B/C消融**，选择[configs/abc](configs/abc/)中的配置。
- **复测冻结产物**，载入[已发布Harness](harnesses/)，使用对应[评测协议](docs/REPRODUCING.md#frozen-artifacts)。

[安装检查](evolution/scripts/smoke.py)使用模拟任务检验运行链，不消耗模型额度。

## 代码与数据

| 目录 | 内容 |
|---|---|
| [evolution](evolution/) | 共同执行层、L4流程、A/B/C控制器 |
| [configs](configs/) | 精确题单、模型设置与起始装配 |
| [harnesses](harnesses/) | 五场景产物、框图、协议和测量 |
| [paper](paper/) | 论文图表与数值记录 |

[软件引用](CITATION.cff) · [发布新结果](docs/PUBLISHING.md) · [MIT许可](LICENSE)

基于[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)构建。Benchmark与依赖归属见[第三方说明](docs/THIRD_PARTY.md)。
