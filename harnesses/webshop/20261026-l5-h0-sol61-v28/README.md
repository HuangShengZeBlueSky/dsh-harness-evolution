# WebShop · v28

**English** | [简体中文](README.zh-CN.md)

Five plugins track selected options, search evidence, purchase readiness, price evidence, and bounded budget-aware search recovery. L5 adoption targets strict success rather than partial shopping reward.

**Release basis: Training-selected final checkpoint**.

| Test success | Published checkpoint | Plugin registrations | Test coverage |
|---:|---|---:|---|
| **44.50%** | **v28** / 40 rounds | 5 | 200 tasks × 3 repeats |

[**Plugin source**](plugins) · [**Method flow**](#method-flow) · [**Architecture**](#architecture) · [**Evolution curve**](#evolution) · [**Run**](#load-this-artifact) · [**All harnesses**](../../../README.md#choose-a-harness)

Actor: **Qwen3-4B-Instruct-2507** · Optimizer: **Sol 6.1 high** · Method: **L5 · Benchmark-specific loop**.

## Method flow

```mermaid
flowchart TD
    A["H0: no enhancement plugins"]
    B["Map current capabilities and problem classes"]
    C["Implement focused native plugins"]
    D["40 training tasks plus 60 validation tasks"]
    E["Training strict success improves; validation strict success does not fall"]
    F["Freeze the training-selected final checkpoint v28"]
    A --> B
    B --> C
    C --> D
    D --> E
    E -->|Adopt or reject; continue| B
    E -->|Budget ends| F
    F --> T["Final-checkpoint test"]
    E --> K["Archive promoted checkpoints"]
    K -.-> R["Independent retrospective tests; no optimizer feedback"]
    T --> P["This release: v28"]
    classDef release fill:#e3f5ef,stroke:#0c7968,color:#145b4b
    class P release
```

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

This WebShop L5 curve shows the strict-success adoption objective. Mean rewards remain in curve.json. Diamonds mark adoption records; the vertical line marks the released checkpoint. Training batches can rotate. Test dots represent actual measurements only.

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
