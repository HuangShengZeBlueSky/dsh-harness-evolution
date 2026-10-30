# osbench · 旧方法续跑 · v38

Continue the original method · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 35.65% · 432 valid episodes / 有效场次。

Run ID: `loop-expansion-sol40-20261026/osbench/original-best-sol61`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/loop-expansion-sol40-20261026--osbench--original-best-sol61.json) · [任务清单](../../../../../results/research/tasks/loop-expansion-sol40-20261026--osbench--original-best-sol61.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["canonical-word-values"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P1["repair-text-submit"] -. "benchmark/setup / llm/stream / system-prompt/assemble / …" .-> H
    P2["grep-prefix-guard"] -. "benchmark/setup / tools/pre-execute" .-> H
    P3["matching-line-guard"] -. "benchmark/setup / tools/pre-execute" .-> H
    P4["shell-path-recovery"] -. "benchmark/setup / tools/pre-execute" .-> H
    P5["grep-regex-guard"] -. "benchmark/setup / tools/pre-execute" .-> H
    P6["temporal-comparison-guard"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P7["schema-field-contract"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P8["numeric-field-filter"] -. "benchmark/setup / tools/pre-execute" .-> H
    P9["size-total-contract"] -. "benchmark/setup / tools/pre-execute" .-> H
    P10["literal-case-contract"] -. "benchmark/setup / tools/pre-execute" .-> H
    P11["nul-file-total"] -. "benchmark/setup / tools/pre-execute" .-> H
    P12["date-component-projection"] -. "benchmark/setup / tools/pre-execute" .-> H
    P13["date-value-contract"] -. "benchmark/setup / tools/pre-execute" .-> H
    P14["ranked-distinct-contract"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P15["explicit-tool-transport"] -. "benchmark/setup / llm/stream / tools/post-execute" .-> H
    P16["semantic-command-transport"] -. "benchmark/setup / llm/stream / tools/post-execute" .-> H
    P17["execution-receipt-gate"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [canonical-word-values](plugins/canonical-word-values.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [repair-text-submit](repair-text-submit.mjs) | `benchmark/setup` · `llm/stream` · `system-prompt/assemble` · `tools/post-execute` |
| [grep-prefix-guard](plugins/grep-prefix-guard.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [matching-line-guard](plugins/matching-line-guard.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [shell-path-recovery](plugins/shell-path-recovery.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [grep-regex-guard](plugins/grep-regex-guard.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [temporal-comparison-guard](plugins/temporal-comparison-guard.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [schema-field-contract](plugins/schema-field-contract.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [numeric-field-filter](plugins/numeric-field-filter.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [size-total-contract](plugins/size-total-contract.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [literal-case-contract](plugins/literal-case-contract.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [nul-file-total](plugins/nul-file-total.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [date-component-projection](plugins/date-component-projection.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [date-value-contract](plugins/date-value-contract.mjs) | `benchmark/setup` · `tools/pre-execute` |
| [ranked-distinct-contract](plugins/ranked-distinct-contract.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [explicit-tool-transport](plugins/explicit-tool-transport.mjs) | `benchmark/setup` · `llm/stream` · `tools/post-execute` |
| [semantic-command-transport](plugins/semantic-command-transport.mjs) | `benchmark/setup` · `llm/stream` · `tools/post-execute` |
| [execution-receipt-gate](plugins/execution-receipt-gate.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
