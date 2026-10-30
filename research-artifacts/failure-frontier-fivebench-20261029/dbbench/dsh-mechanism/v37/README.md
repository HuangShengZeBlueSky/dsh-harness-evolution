# dbbench · 问题机制反馈 · v37

Mechanism feedback · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 55.78% · 900 valid episodes / 有效场次。

Run ID: `failure-frontier-fivebench-20261029/experiments/dbbench/dsh-mechanism`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/failure-frontier-fivebench-20261029--experiments--dbbench--dsh-mechanism.json) · [任务清单](../../../../../results/research/tasks/failure-frontier-fivebench-20261029--experiments--dbbench--dsh-mechanism.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["sql-recovery"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P1["empty-result-recovery"] -. "benchmark/setup / tools/post-execute" .-> H
    P2["execution-grounding"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P3["identifier-literals"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P4["result-fidelity"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P5["output-fields"] -. "benchmark/setup / tools/post-execute" .-> H
    P6["ordinal-aggregate"] -. "benchmark/setup / tools/pre-execute" .-> H
    P7["year-shape"] -. "benchmark/setup / tools/pre-execute" .-> H
    P8["suffix-scope"] -. "benchmark/setup / tools/pre-execute" .-> H
    P9["numeric-literal"] -. "benchmark/setup / tools/pre-execute" .-> H
    P10["query-rebuild"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P11["date-preview"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P12["contains-case"] -. "benchmark/setup / tools/pre-execute" .-> H
    P13["formatted-write"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P14["table-axis"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P15["field-scope"] -. "benchmark/setup / tools/pre-execute" .-> H
    P16["literal-fidelity"] -. "benchmark/setup / tools/pre-execute" .-> H
    P17["format-evidence"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P18["predicate-carry"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P19["numeric-id-max"] -. "benchmark/setup / tools/post-execute" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [sql-recovery](plugins/sql-recovery.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [empty-result-recovery](plugins/empty-result-recovery.mjs) | `benchmark/setup` · `tools/post-execute` |
| [execution-grounding](plugins/execution-grounding.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [identifier-literals](plugins/identifier-literals.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [result-fidelity](plugins/result-fidelity.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [output-fields](plugins/output-fields.mjs) | `benchmark/setup` · `tools/post-execute` |
| [ordinal-aggregate](plugins/ordinal-aggregate.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [year-shape](plugins/year-shape.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [suffix-scope](plugins/suffix-scope.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [numeric-literal](plugins/numeric-literal.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [query-rebuild](plugins/query-rebuild.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [date-preview](plugins/date-preview.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [contains-case](plugins/contains-case.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [formatted-write](plugins/formatted-write.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [table-axis](plugins/table-axis.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [field-scope](plugins/field-scope.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [literal-fidelity](plugins/literal-fidelity.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [format-evidence](plugins/format-evidence.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [predicate-carry](plugins/predicate-carry.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [numeric-id-max](plugins/numeric-id-max.mjs) | `benchmark/setup` · `tools/post-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
