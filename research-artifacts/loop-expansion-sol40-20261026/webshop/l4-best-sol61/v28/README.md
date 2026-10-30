# webshop · L4：已有最佳起点 · v28

L4: seeded continuation · training/development-selected final checkpoint / 按训练或开发规则选定的最终版。

**测试 / Test:** 42.00% · 600 valid episodes / 有效场次。

Run ID: `loop-expansion-sol40-20261026/webshop/l4-best-sol61`。在[结构化结果](../../../../../results/research/runs.json)中按此编号查本组曲线、逐次测试与统计；[配置](../../../../../results/research/protocols/loop-expansion-sol40-20261026--webshop--l4-best-sol61.json) · [任务清单](../../../../../results/research/tasks/loop-expansion-sol40-20261026--webshop--l4-best-sol61.json)。

[组合与启用名单 / Composition](composition.json) · [Mermaid source](diagram.mmd) · [全部方法产物 / All artifacts](../../../../../research-artifacts/README.md)

```mermaid
flowchart LR
    A["Actor / 做题模型"] -->|"tool calls / 工具调用"| H["DSH lifecycle / 生命周期"]
    H --> E["Environment / 真实环境"]
    E -->|"receipts / 实际回执"| A
    P0["search-evidence"] -. "+JSON.stringify({keywords})+ / benchmark/setup / system-prompt/assemble / …" .-> H
    P1["option-ledger"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P2["purchase-closure"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute" .-> H
    P3["shade-ledger"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P4["garment-identity"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P5["demand-ledger"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P6["option-contract"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P7["feature-proof"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P8["code-ledger"] -. "benchmark/setup / tools/post-execute / tools/pre-execute" .-> H
    P9["ring-identity"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P10["measurement-contract"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P11["ingredient-options"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P12["search-frontier"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
    P13["comparison-board"] -. "benchmark/setup / system-prompt/assemble / tools/post-execute / …" .-> H
```

**读图：** 实线是一般模型—工具运行路径；虚线只表示源码中登记的插件挂接，不表示这些插件按顺序执行、每场触发或各自带来独立增益。

**Diagram:** Solid edges show the general actor/tool path. Dashed edges show static source attachments, not ordering, activation in every episode, or independent causal gains.

<details>
<summary>启用插件与源码钩子 / Active plugins and source hooks</summary>

| Plugin source | Source hooks |
|---|---|
| [search-evidence](plugins/search-evidence.mjs) | `+JSON.stringify({keywords})+` · `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [option-ledger](plugins/option-ledger.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [purchase-closure](plugins/purchase-closure.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` |
| [shade-ledger](plugins/shade-ledger.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [garment-identity](plugins/garment-identity.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [demand-ledger](plugins/demand-ledger.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [option-contract](plugins/option-contract.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [feature-proof](plugins/feature-proof.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [code-ledger](plugins/code-ledger.mjs) | `benchmark/setup` · `tools/post-execute` · `tools/pre-execute` |
| [ring-identity](plugins/ring-identity.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [measurement-contract](plugins/measurement-contract.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [ingredient-options](plugins/ingredient-options.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [search-frontier](plugins/search-frontier.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |
| [comparison-board](plugins/comparison-board.mjs) | `benchmark/setup` · `system-prompt/assemble` · `tools/post-execute` · `tools/pre-execute` |

</details>

本目录保留冻结插件及其本地依赖。完整运行仍需共同DSH基础与本场景环境，见[复现说明](../../../../../docs/REPRODUCING.zh-CN.md)。本次导出没有重跑正式测试，也没有修改插件算法。

This directory retains frozen plugins and local dependencies. It still needs the shared DSH runtime and benchmark environment; see [reproduction](../../../../../docs/REPRODUCING.md). Export did not rerun the benchmark or change the plugin algorithms.
