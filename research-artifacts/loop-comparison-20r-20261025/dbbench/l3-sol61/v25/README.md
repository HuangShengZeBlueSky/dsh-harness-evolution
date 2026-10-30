# dbbench · L3：三个分支 · v25

L3: three retained branches · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 58.56% · 900 valid episodes / 有效场次。

Run ID: `loop-comparison-20r-20261025/dbbench/l3-sol61`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/loop-comparison-20r-20261025--dbbench--l3-sol61.json) · [任务清单](../../../../../results/research/tasks/loop-comparison-20r-20261025--dbbench--l3-sol61.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["sql-schema"] -. "benchmark/setup / system-prompt/assemble / tools/pre-execute" .-> H
    P1["sql-contract"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P2["sql-values"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute" .-> H
    P3["sql-plan"] -. "benchmark/setup / system-prompt/assemble" .-> H
    P4["sql-identifiers"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P5["sql-literals"] -. "benchmark/setup / system-prompt/assemble / tools/pre-execute" .-> H
    P6["sql-numeric"] -. "benchmark/setup / system-prompt/assemble / tools/pre-execute" .-> H
    P7["sql-ordinal"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [sql-schema](plugins/sql-schema.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/pre-execute` |
| [sql-contract](plugins/sql-contract.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [sql-values](plugins/sql-values.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` |
| [sql-plan](plugins/sql-plan.mjs) | `benchmark/setup` · `system-prompt/assemble` |
| [sql-identifiers](plugins/sql-identifiers.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [sql-literals](plugins/sql-literals.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/pre-execute` |
| [sql-numeric](plugins/sql-numeric.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/pre-execute` |
| [sql-ordinal](plugins/sql-ordinal.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
