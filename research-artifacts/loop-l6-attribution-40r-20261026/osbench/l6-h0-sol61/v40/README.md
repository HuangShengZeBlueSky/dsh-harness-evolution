# osbench · L6：先计划后编码 · v40

L6: plan before code · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 29.40% · 432 valid episodes / 有效场次。

Run ID: `loop-l6-attribution-40r-20261026/osbench/l6-h0-sol61`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/loop-l6-attribution-40r-20261026--osbench--l6-h0-sol61.json) · [任务清单](../../../../../results/research/tasks/loop-l6-attribution-40r-20261026--osbench--l6-h0-sol61.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["line-count"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P1["home-path"] -. "benchmark/setup / tools/pre-execute" .-> H
    P2["prefix-free"] -. "benchmark/setup / tools/pre-execute" .-> H
    P3["disk-total"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P4["time-filter"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P5["count-receipt"] -. "benchmark/setup / tools/post-execute" .-> H
    P6["file-discovery"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P7["filename-identity"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P8["regex-dialect"] -. "benchmark/setup / tools/pre-execute" .-> H
    P9["temporal-extrema"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P10["calendar-weekday"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P11["repeat-result"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P12["date-filter"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P13["date-prefix"] -. "benchmark/setup / tools/pre-execute" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [line-count](plugins/line-count.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [home-path](plugins/home-path.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [prefix-free](plugins/prefix-free.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [disk-total](plugins/disk-total.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [time-filter](plugins/time-filter.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [count-receipt](plugins/count-receipt.mjs) | `benchmark/setup` · `tools/post-execute` |
| [file-discovery](plugins/file-discovery.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [filename-identity](plugins/filename-identity.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [regex-dialect](plugins/regex-dialect.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [temporal-extrema](plugins/temporal-extrema.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [calendar-weekday](plugins/calendar-weekday.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [repeat-result](plugins/repeat-result.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [date-filter](plugins/date-filter.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [date-prefix](plugins/date-prefix.mjs) | `benchmark/setup` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
