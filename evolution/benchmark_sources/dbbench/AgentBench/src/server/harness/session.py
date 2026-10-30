"""Bridge the current four hooks to AgentRL's full-history session protocol."""
from copy import deepcopy


class FourHookSession:
    def __init__(self, session, harness, tools, limit, switches, task_context=None):
        self.session = session
        self.harness = harness
        self.limit = limit
        self.switches = switches
        self.turn = 0
        # The Task must execute the action returned by H2 directly.  In
        # particular, an action that H2 deliberately allows through must not
        # be sent through the Task's legacy fuzzy matcher a second time.
        self.h2_prevalidated_actions = bool(switches.h2_enabled)
        self.cold = []
        self._h2_suppressed = False
        self.trace = {layer: [] for layer in ('h2', 'h3', 'h4', 'h5')}
        bind = getattr(harness, 'bind_task_context', None)
        if callable(bind):
            bind(deepcopy(task_context))
        patched = harness.h3(deepcopy(tools)) if switches.h3_enabled else deepcopy(tools)
        before, after = deepcopy(tools), deepcopy(patched)
        for collection in (before, after):
            for tool in collection:
                tool['function'].pop('description', None)
        if before != after:
            raise ValueError('H3 may change tool descriptions only')
        if patched != tools:
            self.trace['h3'].append({'before': deepcopy(tools), 'after': deepcopy(patched)})
        session.set_tools(patched)
        # Delta transport cannot remove an ephemeral hint or replace a raw H2 call.
        session.set_full_history(True)

    def inject(self, item):
        patch_message = getattr(self.harness, 'h3_message', None)
        if (
            self.switches.h3_enabled
            and callable(patch_message)
            and isinstance(item, dict)
            and 'role' in item
        ):
            before = deepcopy(item)
            item = patch_message(deepcopy(item))
            if not isinstance(item, dict) or item.get('role') != before.get('role'):
                raise ValueError('H3 message conditioning must preserve the message role')
            if {k: v for k, v in item.items() if k != 'content'} != {
                k: v for k, v in before.items() if k != 'content'
            }:
                raise ValueError('H3 message conditioning may change content only')
            if item != before:
                self.trace['h3'].append({'message_before': before, 'message_after': deepcopy(item)})
        self.session.inject(item)

    def _hints(self, layer, hints):
        if not (isinstance(hints, list) and len(hints) <= 1 and
                all(isinstance(x, str) and len(x.split()) <= 120 for x in hints)):
            raise ValueError('H4/H5 require at most one hint of at most 120 words')
        if hints:
            self.trace[layer].append({'turn': self.turn, 'hints': deepcopy(hints)})
        return hints

    def _prepare_action(self):
        self.turn += 1
        self._h2_suppressed = False
        original = deepcopy(self.session.history)
        public = [deepcopy(x) for x in original if isinstance(x, dict) and 'role' in x]
        if self.turn == 1 and self.switches.h5_enabled:
            self.cold = self._hints('h5', self.harness.h5(deepcopy(public)))
        if self.turn > 1 and self.switches.h4_enabled:
            feedback = self._hints('h4', self.harness.h4(deepcopy(public), self.limit-self.turn+1))
            if feedback:
                prefix = getattr(self.harness, 'h4_message_prefix', 'Execution guidance: ')
                item = {'role': 'user', 'content': prefix + feedback[0]}
                if getattr(self.harness, 'h4_persistent', False):
                    # Compatibility mode for runtimes whose H4 interventions
                    # were historically part of the public episode history.
                    self.session.inject(deepcopy(item))
                    original = deepcopy(self.session.history)
        payload = deepcopy(original)
        if self.cold:
            first = next(x for x in payload if isinstance(x, dict) and 'role' in x)
            prefix = getattr(self.harness, 'h5_message_prefix', '\n\nProcedural guidance:\n')
            first['content'] += prefix + self.cold[0]
        if (
            self.turn > 1
            and self.switches.h4_enabled
            and feedback
            and not getattr(self.harness, 'h4_persistent', False)
        ):
            payload.append(item)
        self.session.cover(payload)
        return original, public

    def _finish_action(self, output, original, public):
        try:
            # The underlying call may return more than one bookkeeping message,
            # but the contract repairs exactly the assistant action message.
            raw = next((deepcopy(m) for m in output.messages if m.get('role') == 'assistant'),
                       {'role': 'assistant', 'content': ''})
            raw = {k: v for k, v in raw.items() if k in ('role', 'content', 'tool_calls') and v is not None}
            repaired = self.harness.h2(deepcopy(raw), deepcopy(public)) if self.switches.h2_enabled else raw
            if not isinstance(repaired, dict) or repaired.get('role') != 'assistant':
                raise ValueError('H2 must return an assistant message')
            control = repaired.pop('_harness_control', None)
            if repaired != raw:
                self.trace['h2'].append({'turn': self.turn, 'before': raw, 'after': deepcopy(repaired)})
        finally:
            self.session.cover(original)
        if control:
            if not isinstance(control, dict) or control.get('action') != 'suppress_tool':
                raise ValueError('Invalid H2 host control')
            self.session.inject(deepcopy(raw))
            for item in control.get('messages', []):
                if not isinstance(item, dict) or item.get('role') not in ('user', 'tool'):
                    raise ValueError('Invalid H2 control message')
                self.session.inject(deepcopy(item))
            self._h2_suppressed = True
            output.messages = []
            self.session.controller.env_output.history = deepcopy(self.session.history)
            return output
        no_tool_handler = getattr(self.harness, 'h2_no_tool_message', None)
        if (
            self.switches.h2_enabled
            and not (repaired.get('tool_calls') or [])
            and callable(no_tool_handler)
        ):
            nudge = no_tool_handler(
                deepcopy(raw), max(0, self.limit - self.turn + 1)
            )
            if nudge:
                self.session.inject(deepcopy(raw))
                self.session.inject({'role': 'user', 'content': str(nudge)})
                self._h2_suppressed = True
                output.messages = []
                self.session.controller.env_output.history = deepcopy(self.session.history)
                return output
        history_message = (
            raw
            if getattr(self.harness, 'h2_preserve_raw_history', False)
            else repaired
        )
        self.session.inject(deepcopy(history_message))
        drain = getattr(self.harness, 'drain_h2_messages', None)
        side_messages = drain() if self.switches.h2_enabled and callable(drain) else []
        if not isinstance(side_messages, list):
            raise ValueError('H2 side messages must be a list')
        for item in side_messages:
            if isinstance(item, str):
                item = {'role': 'user', 'content': item}
            if not isinstance(item, dict) or item.get('role') != 'user' or not isinstance(item.get('content'), str):
                raise ValueError('H2 side messages must be public user messages')
            self.session.inject(deepcopy(item))
        output.messages = [repaired]
        self.session.controller.env_output.history = deepcopy(self.session.history)
        return output

    def consume_h2_suppressed(self):
        suppressed = self._h2_suppressed
        self._h2_suppressed = False
        return suppressed

    def sync_action(self):
        original, public = self._prepare_action()
        try:
            output = self.session.sync_action()
        except BaseException:
            self.session.cover(original)
            raise
        return self._finish_action(output, original, public)

    async def action(self):
        """Async AgentRL bridge used by DBBench and OS Interaction."""
        original, public = self._prepare_action()
        try:
            output = await self.session.action()
        except BaseException:
            self.session.cover(original)
            raise
        return self._finish_action(output, original, public)
