# dbbench · 旧方法续跑 · v40

Continue the original method · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 62.22% · 900 valid episodes / 有效场次。

Run ID: `loop-expansion-sol40-20261026/dbbench/original-best-sol61`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/loop-expansion-sol40-20261026--dbbench--original-best-sol61.json) · [任务清单](../../../../../results/research/tasks/loop-expansion-sol40-20261026--dbbench--original-best-sol61.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["sql-workflow"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute" .-> H
    P1["value-grounding"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P2["task-contract"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P3["insert-grounding"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P4["numeric-identity"] -. "benchmark/setup / tools/post-execute" .-> H
    P5["result-fields"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P6["finalization-contract"] -. "benchmark/setup / system-prompt/assemble / tools/pre-execute" .-> H
    P7["calendar-semantics"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P8["aggregate-format"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P9["schedule-order"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P10["insert-field-roles"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P11["insert-representation"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P12["schema-orientation"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P13["quantity-answer"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P14["listed-count"] -. "benchmark/setup / tools/pre-execute" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [sql-workflow](plugins/sql-workflow.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` |
| [value-grounding](plugins/value-grounding.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [task-contract](plugins/task-contract.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [insert-grounding](plugins/insert-grounding.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [numeric-identity](plugins/numeric-identity.mjs) | `benchmark/setup` · `tools/post-execute` |
| [result-fields](plugins/result-fields.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [finalization-contract](plugins/finalization-contract.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/pre-execute` |
| [calendar-semantics](plugins/calendar-semantics.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [aggregate-format](plugins/aggregate-format.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [schedule-order](plugins/schedule-order.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [insert-field-roles](plugins/insert-field-roles.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [insert-representation](plugins/insert-representation.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [schema-orientation](plugins/schema-orientation.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [quantity-answer](plugins/quantity-answer.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [listed-count](plugins/listed-count.mjs) | `benchmark/setup` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
