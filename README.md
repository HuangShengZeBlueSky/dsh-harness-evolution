# HookEvo

[![HookEvo paper overview and edit-scope results](website/cover.png)](https://huangshengzebluesky.github.io/dsh-harness-evolution/)

**A Framework for Coordinated Plugin Evolution on Hook-Enabled Agent Runtimes**

HookEvo searches for task-specific plugins around a frozen language-model agent. A separate improver reads execution traces and proposes a patch. One patch can change both the handler that records a tool result and the handler that uses it later in the episode. DeepSeek Harness provides the runtime and lifecycle hooks.

[Project page](https://huangshengzebluesky.github.io/dsh-harness-evolution/) · [Explore a checkpoint](https://huangshengzebluesky.github.io/dsh-harness-evolution/#checkpoints) · [Download checkpoints](artifacts/) · [Installation](#installation) · [Evaluation and search](REPRODUCING.md) · [Controller source](evolution/src/dsh_evolve/abc.py)

![One round of HookEvo, from parent traces through a candidate patch to paired evaluation and feedback](figures/method-overview.png)

## Paper checkpoints

The executor is Qwen3-4B-Instruct-2507. Each row gives the highest measured checkpoint reported for that benchmark, with mean held-out success and sample standard deviation across three executions. The checkpoint identifier is local to its search run.

| Benchmark | Released checkpoint | Held-out tasks | Success (%) | What to inspect |
| --- | --- | ---: | ---: | --- |
| ALFWorld | [v06](artifacts/alfworld) | 109 | 95.41 ± 0.00 | [Action hints](artifacts/alfworld/plugins/action-hint.mjs) turn accepted receipts into episode state for context and action checks. [Architecture](figures/alfworld-architecture.png) |
| DBBench | [v35](artifacts/dbbench) | 300 | 70.56 ± 0.38 | The [write workflow](artifacts/dbbench/plugins/write-workflow.mjs) and [result bridge](artifacts/dbbench/plugins/result-bridge.mjs) use SQL receipts to guide later calls and answers. [Architecture](figures/dbbench-architecture.png) |
| WebShop | [v12](artifacts/webshop) | 200 | 48.17 ± 0.29 | The [option ledger](artifacts/webshop/plugins/option-ledger.mjs) and [search evidence](artifacts/webshop/plugins/search-evidence.mjs) track product and option evidence. [Architecture](figures/webshop-architecture.png) |
| OSBench | [v01](artifacts/osbench) | 144 | 41.67 ± 1.84 | The retained change is the skill text in [composition.json](artifacts/osbench/composition.json). Its executable composition is empty. [Architecture](figures/osbench-architecture.png) |

## How the search works

1. Run the parent harness on a training batch. Save its scores, hook outputs, and successful and failed trajectories.
2. Give the improver sampled trajectories, parent source, runtime interfaces, and the previous decision. It proposes one replacement and a rationale. Scope A edits skill text, B edits one independent component, and C permits coordinated edits that share episode-local state.
3. Compare the candidate and parent on matching tasks, trials, and seeds. Retain a candidate when the training objective improves, an emitted hook output changes, and validation performance holds or improves when validation is configured.
4. Feed the decision, repairs, and regressions into the next round. Accepted code persists across rounds. Each new episode starts with fresh runtime state.

[Reported evolution curves](figures/best-harness-evolution.png) · [Scope C hook implementation](evolution/src/dsh_evolve/assets/slot-c.mjs)

## Installation

From the repository root on Linux or macOS, use Python 3.10–3.12 and Node.js 22.19 or later with npm.

~~~bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e evolution
python evolution/scripts/smoke.py ./runs/smoke
~~~

The smoke run uses the real DSH runtime, a scripted actor, and a synthetic task. It installs Node dependencies and exercises A/B/C proposals, selection, and held-out evaluation without a model account. Choose a fresh output directory for another smoke run.

For benchmark tasks, start with the [reproduction guide](REPRODUCING.md). It separates evaluation of a released checkpoint from running a new search and lists the external assets needed for each benchmark.

## License

The repository uses the [MIT license](LICENSE). Bundled benchmark scoring code carries its [upstream license notices](evolution/benchmark_sources/README.md).
