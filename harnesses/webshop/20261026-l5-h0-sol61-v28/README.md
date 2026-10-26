# WebShop · v28

Five plugins track selected options, search evidence, purchase readiness, price evidence, and bounded budget-aware search recovery. L5 adoption targets strict success rather than partial shopping reward.

**Pass@1: 44.50%** · 600 valid episodes · 200 tasks × 3 repeats

Actor: **Qwen3-4B-Instruct-2507**. Optimizer: **Sol 6.1 high**. Method: **L5 · 场景专用循环**. Budget: **40 rounds**.

## Architecture

```mermaid
flowchart TD
    O[Visible task and observations]
    S[DSH system prompt and state]
    M[Frozen Qwen3 4B actor]
    T[Native tool execution hooks]
    X[Benchmark environment and real receipts]
    A["Search evidence + budget search"]
    B["Selected-option ledger"]
    C["Price evidence + checkout loop"]
    O --> A
    O --> B
    O --> C
    A --> S
    B --> S
    C --> S
    C -. native pre-execute intervention .-> T
    S --> M
    M --> T
    T --> X
    X --> O
    classDef plugin fill:#e8f0ff,stroke:#3861d8,color:#142c55
    class A,B,C plugin
```

Arrows show runtime responsibilities, not independent causal gains.

## Evolution

![Recorded evolution](evolution.png)

[Machine-readable curve](curve.json) · [Evaluation protocol](protocol.json) · [Composition](composition.json)

Development curves show recorded candidate scores; rotating batches can cause rises and falls. Test dots represent actual measurements only. WebShop development scores here are mean reward; its published ranking uses strict success.

## Plugin inventory

| Module | Responsibility |
|---|---|
| [option-ledger.mjs](plugins/option-ledger.mjs) | Track real option selections and outstanding requested specifications. |
| [search-evidence.mjs](plugins/search-evidence.mjs) | Use visible search/product evidence for candidate comparison. |
| [checkout-loop.mjs](plugins/checkout-loop.mjs) | Control premature or repeated checkout attempts. |
| [price-evidence.mjs](plugins/price-evidence.mjs) | Check visible price against the user budget. |
| [budget-search.mjs](plugins/budget-search.mjs) | At most one bounded alternative click after an explicitly over-budget choice. |

## Load this artifact

```bash
MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs harnesses/webshop/20261026-l5-h0-sol61-v28
```

Run from the repository root after `npm install`. This starts the native DSH bridge. Supply the benchmark environment/executor separately; see [integration instructions](../../../docs/RUNNING.md).

## Evaluation notes

- Paper AgentBench scores use one trial; these results average three trials.

Export changes are limited to portable module paths, selectable listener ports, runtime configuration, and removal of local-path metadata. Reported scores come from the original completed evaluations; the packaged copy has not been scored again.
