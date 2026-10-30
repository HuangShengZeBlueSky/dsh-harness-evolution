# osbench · L7：失败覆盖与场景验证 · v32

L7: failure coverage and benchmark validation · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 31.71% · 432 valid episodes / 有效场次。

Run ID: `loop-l789-sol40-20261026/osbench/l7-sol61`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/loop-l789-sol40-20261026--osbench--l7-sol61.json) · [任务清单](../../../../../results/research/tasks/loop-l789-sol40-20261026--osbench--l7-sol61.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["clean-unique"] -. "benchmark/setup / system-prompt/assemble / tools/pre-execute" .-> H
    P1["shell-recovery"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P2["matching-lines"] -. "benchmark/setup / system-prompt/assemble / tools/pre-execute" .-> H
    P3["log-order"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P4["line-length"] -. "benchmark/setup / system-prompt/assemble / tools/pre-execute" .-> H
    P5["gzip-content"] -. "benchmark/setup / tools/pre-execute" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [clean-unique](plugins/clean-unique.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/pre-execute` |
| [shell-recovery](plugins/shell-recovery.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [matching-lines](plugins/matching-lines.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/pre-execute` |
| [log-order](plugins/log-order.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [line-length](plugins/line-length.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/pre-execute` |
| [gzip-content](plugins/gzip-content.mjs) | `benchmark/setup` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
