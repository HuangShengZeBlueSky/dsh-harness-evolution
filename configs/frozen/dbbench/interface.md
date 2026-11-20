### Shared runtime interface

The actor is frozen Qwen3-4B-Instruct-2507. The actor receives the task, visible interaction history, native tools and their receipts. The benchmark runs the native tools and owns the score.

The skill is one text section appended to the actor's system instructions. The host loads each executable aspect independently for each episode. All outputs are optional and apply only to the current episode.

- **Memory** receives `observe(call, rawReceipt)` after a tool action. Its local facts can be summarized as text by `guide()` before the next actor request.
- **Action** receives `check(call)` before execution. A reason string returns feedback to the actor and blocks that attempted action. An empty result allows execution.
- **Receipt** receives `explain(call, rawReceipt)` after execution. A string is appended to the actor-visible receipt.

A call provides `name`, `arguments` (a parsed object or JSON string), and `callId`. A raw receipt, when available, provides `content` and an error indicator. Each aspect receives its own copy of the inputs. Return concise and actionable text grounded in those inputs. The executable module format is a plain JavaScript `export function create() { ... }` returning the handlers for the selected aspect.
