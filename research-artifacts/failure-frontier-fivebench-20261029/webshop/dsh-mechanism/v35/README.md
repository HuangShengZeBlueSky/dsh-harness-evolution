# webshop · 问题机制反馈 · v35

Mechanism feedback · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 42.33% · 600 valid episodes / 有效场次。

Run ID: `failure-frontier-fivebench-20261029/experiments/webshop/dsh-mechanism`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/failure-frontier-fivebench-20261029--experiments--webshop--dsh-mechanism.json) · [任务清单](../../../../../results/research/tasks/failure-frontier-fivebench-20261029--experiments--webshop--dsh-mechanism.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["result-coverage"] -. "benchmark/setup / tools/post-execute" .-> H
    P1["detail-navigation"] -. "benchmark/setup / tools/post-execute" .-> H
    P2["option-focus"] -. "benchmark/setup / tools/post-execute" .-> H
    P3["budget-guard"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P4["action-availability"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P5["blue-variant"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [result-coverage](plugins/result-coverage.mjs) | `benchmark/setup` · `tools/post-execute` |
| [detail-navigation](plugins/detail-navigation.mjs) | `benchmark/setup` · `tools/post-execute` |
| [option-focus](plugins/option-focus.mjs) | `benchmark/setup` · `tools/post-execute` |
| [budget-guard](plugins/budget-guard.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [action-availability](plugins/action-availability.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [blue-variant](plugins/blue-variant.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
