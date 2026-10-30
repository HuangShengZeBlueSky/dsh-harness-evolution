# Frozen scoring-source subset

Small unmodified source subsets from the Life-Harness/AgentBench checkout used by the experiments are included so an external user need not guess which moving upstream grader to load. Each domain includes its upstream license. The adapter extracts the required task initialization and scoring methods; it does not replace the benchmark reward with a new scorer.

- `dbbench/AgentBench/src/server/tasks/dbbench/`: database initialization, SQL execution and result processing.
- `dbbench/AgentBench/src/server/harness/`: reference-wrapper interfaces used by the common transport.
- `osbench/`: OS task fixture loader/grader and reference-wrapper interfaces.

Source: [Life-Harness](https://github.com/Tianshi-Xu/Life-Harness), source snapshot used in the October 2026 campaigns. This is a code subset, not the datasets, task container images or a claim to contain a paper's final evolved harness. Dataset and environment identity remain separate reproduction requirements.

`dsh-evolve init` copies the matching subset as the work directory's `source/` unless the supplied asset directory already includes one. Replacing it changes the evaluation implementation and should be documented as a new protocol.
