# DBBench · v32

**English** | [简体中文](README.zh-CN.md)

L4 intermediate checkpoint v32: eight plugin responsibilities, with numeric/date profiling and reduced tie-related guidance. Its 70.33% test result corroborates the later final v35 at 70.56%.

**Release basis: Retrospective test of a promoted checkpoint**. Original training-selected final: **v35**.

| Test success | Published checkpoint | Plugin registrations | Test coverage |
|---:|---|---:|---|
| **70.33%** | **v32** / 40 rounds | 8 | 300 tasks × 3 repeats |

[**Plugin source**](plugins) · [**Method flow**](#method-flow) · [**Architecture**](#architecture) · [**Evolution curve**](#evolution) · [**Run**](#load-this-artifact) · [**All harnesses**](../../../README.md#choose-a-harness)

Actor: **Qwen3-4B-Instruct-2507** · Optimizer: **Sol 6.1 high** · Method: **L4 · Agent capability map**.

## Method flow

```mermaid
flowchart TD
    A["H0: no enhancement plugins"]
    B["Maintain agent structure and plugin responsibility map"]
    C["Propose a problem-class repair, then implement plugins"]
    D["Same 50-task training batch"]
    E["Training improves and change takes effect"]
    F["Freeze the training-selected final checkpoint v35"]
    A --> B
    B --> C
    C --> D
    D --> E
    E -->|Adopt or reject; continue| B
    E -->|Budget ends| F
    F --> T["Final-checkpoint test"]
    E --> K["Archive promoted checkpoints"]
    K -.-> R["Independent retrospective tests; no optimizer feedback"]
    R --> P["This release: v32"]
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
    A["Schema + literal grounding"]
    B["Intent + numeric/calendar"]
    C["Write workflow + result bridge"]
    D["SQL recovery + budget"]
    O --> A
    O --> B
    A --> S
    B --> S
    X --> C
    X --> D
    C --> S
    D --> S
    S --> M
    M --> T
    T --> X
    X --> O
    classDef plugin fill:#e8f0ff,stroke:#3861d8,color:#142c55
    class A,B,C,D plugin
```

Arrows show runtime responsibilities, not independent causal gains.

## Evolution

![Recorded evolution](evolution.png)

[Machine-readable curve](curve.json) · [Evaluation protocol](protocol.json) · [Composition](composition.json)

Diamonds mark adoption records; the vertical line marks the released checkpoint. Training batches can rotate. Test dots represent actual measurements only.

## Plugin inventory

| Module | Responsibility |
|---|---|
| [schema-contract.mjs](plugins/schema-contract.mjs) | Exact schema names and bounded SQL identifier checks. |
| [literal-contract.mjs](plugins/literal-contract.mjs) | Ground filter values in observed database literals. |
| [write-workflow.mjs](plugins/write-workflow.mjs) | Track mutation execution and actual completion receipts. |
| [result-bridge.mjs](plugins/result-bridge.mjs) | Align observed result shape with final submission. |
| [sql-recovery.mjs](plugins/sql-recovery.mjs) | Remember SQL errors and guide non-repeating recovery. |
| [budget-conductor.mjs](plugins/budget-conductor.mjs) | Use remaining model-call budget and finish deliberately. |
| [numeric-calendar.mjs](plugins/numeric-calendar.mjs) | Handle numeric/date formats and relevant profiling. |
| [intent-contract.mjs](plugins/intent-contract.mjs) | Translate task intent into operation and direction constraints. |

## Load this artifact

```bash
MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs harnesses/dbbench/20261027-l4-h0-sol61-v32
```

Run from the repository root after `npm install`. This starts the native DSH bridge. Supply the benchmark environment/executor separately; see [integration instructions](../../../docs/RUNNING.md).

## Evaluation notes

- Published from an adopted checkpoint with a complete retrospective test. Selected for publication using already observed test scores; not a fresh confirmatory evaluation.
- Original training-selected final checkpoint is v35. Its identity and original result are retained.
- Paper AgentBench uses one trial; this measurement averages three repeats.

Export changes are limited to portable module paths, selectable listener ports, runtime configuration, and removal of local-path metadata. Reported scores come from the original completed evaluations; the packaged copy has not been scored again.
