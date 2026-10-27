# OSBench · v17

**English** | [简体中文](README.zh-CN.md)

Five plugins structure shell-task interpretation, file inspection, sample evidence, global aggregation, and recovery from repeated commands. The actor and OS task evaluator remain frozen.

**Release basis: Training-selected final checkpoint**.

| Test success | Published checkpoint | Plugin registrations | Test coverage |
|---:|---|---:|---|
| **38.89%** | **v17** / 40 rounds | 5 | 144 tasks × 3 repeats |

[**Plugin source**](plugins) · [**Method flow**](#method-flow) · [**Architecture**](#architecture) · [**Evolution curve**](#evolution) · [**Run**](#load-this-artifact) · [**All harnesses**](../../../README.md#choose-a-harness)

Actor: **Qwen3-4B-Instruct-2507** · Optimizer: **Sol 6.1 high** · Method: **L4 · Agent capability map**.

## Method flow

```mermaid
flowchart TD
    A["H0: no enhancement plugins"]
    B["Maintain agent structure and plugin responsibility map"]
    C["Propose a problem-class repair, then implement plugins"]
    D["80 training tasks plus 20 validation tasks"]
    E["Train improves; validation does not fall; change takes effect"]
    F["Freeze the training-selected final checkpoint v17"]
    A --> B
    B --> C
    C --> D
    D --> E
    E -->|Adopt or reject; continue| B
    E -->|Budget ends| F
    F --> T["Final-checkpoint test"]
    E --> K["Archive promoted checkpoints"]
    K -.-> R["Independent retrospective tests; no optimizer feedback"]
    T --> P["This release: v17"]
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
    A["Task contract + inspection"]
    B["Sample evidence"]
    C["Global projection"]
    D["Repetition recovery"]
    O --> A
    X --> B
    A --> S
    B --> S
    C --> S
    X --> D
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
| [inspection-contract.mjs](plugins/inspection-contract.mjs) | Inspect relevant files and schema before committing to a command. |
| [global-projection.mjs](plugins/global-projection.mjs) | Preserve task-wide aggregation and projection semantics. |
| [sample-evidence.mjs](plugins/sample-evidence.mjs) | Use actual sampled contents instead of guessed fields or separators. |
| [task-contract.mjs](plugins/task-contract.mjs) | State target, scope, filtering, and answer requirements. |
| [repetition-recovery.mjs](plugins/repetition-recovery.mjs) | Detect repeated commands and prompt a changed strategy. |

## Load this artifact

```bash
MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs harnesses/osbench/20261026-l4-h0-sol61-v17
```

Run from the repository root after `npm install`. This starts the native DSH bridge. Supply the benchmark environment/executor separately; see [integration instructions](../../../docs/RUNNING.md).

## Evaluation notes

- Paper AgentBench scores use one trial; these results average three trials.

Export changes are limited to portable module paths, selectable listener ports, runtime configuration, and removal of local-path metadata. Reported scores come from the original completed evaluations; the packaged copy has not been scored again.
