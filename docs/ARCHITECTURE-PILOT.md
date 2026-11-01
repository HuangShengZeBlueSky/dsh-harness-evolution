# Four benchmarks, five architectural routes, eight rounds

[简体中文](ARCHITECTURE-PILOT.zh-CN.md) · [Architecture lab](../site/architecture.html)

This exploratory pilot tests one primary architectural change at a time: **4 benchmarks × 5 routes × 8 candidate decisions = 20 groups and 160 decisions**. The protocol is prepared; launch and completion claims require actual run records.

| Route | Change from the common baseline |
|---|---|
| `base` | One parent chain, one candidate per round; adopt only a strict full-training success gain with observed effective changes. |
| `evidence` | Organize the same-size evidence packet by observable failure features rather than random failure/success selection. |
| `mechanism` | Write two short, distinct mechanism proposals, then implement and evaluate only one. |
| `validation` | Add a non-regression gate on independent validation strict success. |
| `memory` | Use the same optimizer to maintain concise conditional experience from prior measured feedback; no additional teacher call. |

A program owns preparation, evaluation and adoption. Luna diagnoses and edits the candidate. All routes receive real feedback; only the memory route maintains the explicit experience artifact. A written plan or a loaded plugin is not a completed execution stage.

- Benchmarks: ALFWorld, DBBench, WebShop and OSBench; no Telecom.
- Optimizer: `gpt-6-luna`, high reasoning. Actor: `Qwen3-4B-Instruct-2507`, with unchanged native benchmark interfaces and budgets.
- Start: shared, protocol-matched H0 with no enhancement plugins.
- Data: 100 fixed training tasks per benchmark, plus 60 fixed validation tasks from the remaining training pool, disjoint from training and test. No training rotation.
- Evidence: up to 8 failures and 4 successful controls, under the same 24,000-character packet cap. Observable-feature grouping is not oracle causal annotation.
- All routes evaluate the same training and validation tasks. Only `validation` uses aggregate validation scores for adoption; validation traces are not supplied to the optimizer.
- After eight decisions, seal the selected checkpoint and evaluate it on 109/300/200/144 test tasks respectively, with three trials. No intermediate tests or test-driven reselection.

Completion requires **160 candidate decisions and 20 complete final-test records**. Preserve valid evaluations and fill missing/invalid work; infrastructure errors are not task failures, and ordinary failed tasks are not repeatedly rerun to select higher scores.

Candidate and evaluation budgets are aligned, but actual optimizer tokens, calls and elapsed time may differ and must be recorded. Three final-checkpoint trials are not three independent searches. Existing test tasks have appeared in historical analysis, so this is architectural screening, not a fresh blind confirmation or a SOTA claim. Dataset-ratio changes, stronger starting harnesses, new tool access and adaptive stopping are separate future comparisons.
