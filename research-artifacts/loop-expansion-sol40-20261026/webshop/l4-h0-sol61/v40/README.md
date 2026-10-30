# webshop · L4：插件能力结构 · v40

L4: plugin capability map · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 40.83% · 600 valid episodes / 有效场次。

Run ID: `loop-expansion-sol40-20261026/webshop/l4-h0-sol61`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/loop-expansion-sol40-20261026--webshop--l4-h0-sol61.json) · [任务清单](../../../../../results/research/tasks/loop-expansion-sol40-20261026--webshop--l4-h0-sol61.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["budget-check"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P1["details-return"] -. "benchmark/setup / tools/post-execute" .-> H
    P2["option-ledger"] -. "benchmark/setup / tools/post-execute" .-> H
    P3["query-cleanup"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P4["identity-evidence"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P5["action-recovery"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P6["comparison-stop"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P7["retrieval-focus"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P8["named-identity"] -. "+JSON.stringify({value})+ / benchmark/setup / tools/post-execute / …" .-> H
    P9["variant-evidence"] -. "+JSON.stringify({value:x.value})+ / benchmark/setup / tools/post-execute / …" .-> H
    P10["capacity-match"] -. "+JSON.stringify({keywords: / +JSON.stringify({value:offered[0].v})+ / benchmark/setup / …" .-> H
    P11["named-color"] -. "+JSON.stringify({keywords:query})+ / +JSON.stringify({value:offered[0].v})+ / benchmark/setup / …" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [budget-check](plugins/budget-check.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [details-return](plugins/details-return.mjs) | `benchmark/setup` · `tools/post-execute` |
| [option-ledger](plugins/option-ledger.mjs) | `benchmark/setup` · `tools/post-execute` |
| [query-cleanup](plugins/query-cleanup.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [identity-evidence](plugins/identity-evidence.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [action-recovery](plugins/action-recovery.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [comparison-stop](plugins/comparison-stop.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [retrieval-focus](plugins/retrieval-focus.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [named-identity](plugins/named-identity.mjs) | `+JSON.stringify({value})+` · `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [variant-evidence](plugins/variant-evidence.mjs) | `+JSON.stringify({value:x.value})+` · `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [capacity-match](plugins/capacity-match.mjs) | `+JSON.stringify({keywords:` · `+JSON.stringify({value:offered[0].v})+` · `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [named-color](plugins/named-color.mjs) | `+JSON.stringify({keywords:query})+` · `+JSON.stringify({value:offered[0].v})+` · `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
