# Load and integrate a released harness

Requires Node.js 22.19 or later and access to an OpenAI-compatible Qwen3-4B-Instruct-2507 endpoint. Exact DSH package versions are in `package.json`.

```bash
npm install
node tools/check.mjs
MODEL_BASE_URL=http://localhost:8000/v1 \
  node tools/serve.mjs harnesses/dbbench/20261026-l4-h0-sol61-v35
```

The host listens on `127.0.0.1:8766`; use `PORT` to change it. `HARNESS_STATE_DIR` controls local session logs. AgentBench bridges accept `MODEL_API_KEY` when your endpoint needs authentication. The historical Telecom bridge expects an endpoint/proxy compatible with its original unauthenticated local transport.

This command starts the **harness runtime**, not the complete benchmark. Datasets, Docker task images, MySQL, WebShop's product index, and a Telecom user simulator must be supplied separately. We do not package private model endpoints or benchmark trajectories.

## Native benchmark bridge

The four AgentBench artifacts use their exported measured `benchmark/setup` runtime. The external environment owns task state, tool execution, and grading. The bridge owns DSH prompt assembly, plugin state, tool hooks, and model calls.

The runtime provides `/health`, `/open`, `/advance`, `/result`, and `/close` HTTP routes. Consult each artifact's `lib/bridge.mjs` for the exact request/response contract; do not substitute an ordinary prompt-only runner. An `/open` request supplies the visible system prompt, native tool schemas, history, seed, and environment executor endpoint. Model-directed tool calls are sent to that executor and the real receipts return through DSH hooks.

Base prompt/tool files are provided where the original runner used them. DBBench obtains its SQL tool schema and prompt from the environment. Use the recorded model-call and environment budgets in `protocol.json`.

## Telecom integration

Telecom preserves its actual profile and `review-bridge.mjs`, rather than reusing an AgentBench bridge. Its native hooks include `telecom/setup`. [Integration sources](../integrations/telecom) show the original Python adapter contract (`tau2_bridge.py`) and read-only business-account fact selection (`account_facts.py`). They expect the matching Tau2 environment interfaces, including the local runner's message/account adapter extensions; they are integration references, not a claim that an unmodified upstream checkout is drop-in compatible.

The released composition contains 30 inherited prompt/description/schema/result/memory surfaces and five custom registrations. The actual runtime additionally performs auxiliary review. Preserve these features when reproducing the reported result, and account for their information access and model calls when comparing methods.

## Rebuilding public figures

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python tools/build.py
```

This regenerates the public leaderboard and evolution figures from released data. It makes no model calls and does not start experiments.
