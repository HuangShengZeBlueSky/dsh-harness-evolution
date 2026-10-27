# WebShop · v12

**English** | [简体中文](README.zh-CN.md)

Two cooperative plugins combine visible search evidence with explicit option tracking. Starting from an earlier method-1 final harness, v12 reached 47.00% strict success in retrospective testing. Its original adoption objective was mean reward, not strict success.

**Release basis: Retrospective test of a promoted checkpoint**. Original training-selected final: **v36**.

| Test success | Published checkpoint | Plugin registrations | Test coverage |
|---:|---|---:|---|
| **47.00%** | **v12** / 40 rounds | 2 | 200 tasks × 3 repeats |

[**Plugin source**](plugins) · [**Method flow**](#method-flow) · [**Architecture**](#architecture) · [**Evolution curve**](#evolution) · [**Run**](#load-this-artifact) · [**All harnesses**](../../../README.md#choose-a-harness)

Actor: **Qwen3-4B-Instruct-2507** · Optimizer: **Sol 6.1 high** · Method: **Method 1 cooperative · Best-checkpoint continuation**.

## Method flow

```mermaid
flowchart TD
    A["Old method-1 final checkpoint v37"]
    B["Diagnose visible search and option-selection failures"]
    C["Cooperative edits to two or more effective plugins"]
    D["Parent vs candidate on the same 50 training tasks"]
    E["Mean reward improves and edits take effect"]
    F["Freeze the training-selected final checkpoint v36"]
    A --> B
    B --> C
    C --> D
    D --> E
    E -->|Adopt or reject; continue| B
    E -->|Budget ends| F
    F --> T["Final-checkpoint test"]
    E --> K["Archive promoted checkpoints"]
    K -.-> R["Independent retrospective tests; no optimizer feedback"]
    R --> P["This release: v12"]
    classDef release fill:#e3f5ef,stroke:#0c7968,color:#145b4b
    class P release
```

## Architecture

```mermaid
flowchart TD
    U[Visible user requirement and page] --> P[Visible-state parsing helpers]
    P --> S[search-evidence: identity, features, price]
    P --> O[option-ledger: real variant selections]
    R[Shared resume-policy helpers] --> S
    R --> O
    S --> A[DSH prompt and episode state]
    O --> A
    A --> Q[Frozen Qwen3-4B]
    Q --> G[Native pre-execute checks]
    G --> E[WebShop search / click / buy]
    E --> F[Real page receipts]
    F --> P
    E --> J[External benchmark scoring]
```

Arrows show runtime responsibilities, not independent causal gains.

## Evolution

![Recorded evolution](evolution.png)

[Machine-readable curve](curve.json) · [Evaluation protocol](protocol.json) · [Composition](composition.json)

This cooperative WebShop method adopts by mean reward; the test panel ranks strict success. Diamonds mark adoption records; the vertical line marks the released checkpoint. Training batches can rotate. Test dots represent actual measurements only.

## Plugin inventory

| Module | Responsibility |
|---|---|
| [search-evidence.mjs](plugins/search-evidence.mjs) | Ground product search, price and feature evidence; check legal page actions. |
| [option-ledger.mjs](plugins/option-ledger.mjs) | Track actual variant choices and remaining requested specifications. |

## Load this artifact

```bash
MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs harnesses/webshop/20261027-original-best-sol61-v12
```

Run from the repository root after `npm install`. This starts the native DSH bridge. Supply the benchmark environment/executor separately; see [integration instructions](../../../docs/RUNNING.md).

## Evaluation notes

- Published from an adopted checkpoint with a complete retrospective test. Selected for publication using already observed test scores; not a fresh confirmatory evaluation.
- Original training-selected final checkpoint is v36. Its identity and original result are retained.
- Paper AgentBench uses one trial; this measurement averages three repeats.
- The v01 training score of zero is a real 50/50-valid evaluation: a plugin scope error broke ledger receipts and the candidate was rejected. The failed candidate remains visible in the development curve.

Export changes are limited to portable module paths, selectable listener ports, runtime configuration, and removal of local-path metadata. Reported scores come from the original completed evaluations; the packaged copy has not been scored again.
