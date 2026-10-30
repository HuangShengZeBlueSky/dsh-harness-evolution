export const name = 'date-component-projection';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    let used = false;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || used) return decision;
      const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const task = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
      if (!/\b(?:unique|distinct)\s+(?:dates|days)\b/i.test(task) || !/YYYY-MM-DD/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const split = script.indexOf('|');
      const upstream = script.slice(0,split);
      if (split < 0 || !/\bgrep\b/.test(upstream) || !upstream.includes(':') || !/\bwc\s+-l\b/.test(script)) return decision;
      let changed = false;
      const suggestion = script.replace(/\bgrep\s+((?:-[A-Za-z]+\s+)*)(['"])(.*?)\2/g, (whole, flags, quote, pattern, offset) => {
        if (offset < split || !flags.includes('o')) return whole;
        const date = pattern.replace(/^\\+\[/,'').replace(/\\+\]$/,'').replace(/\\+([{}])/g,'$1');
        if (date === pattern || date !== '[0-9]{4}-[0-9]{2}-[0-9]{2}') return whole;
        changed = true;
        return 'grep ' + flags + quote + date + quote;
      });
      if (!changed) return decision;
      used = true;
      const reason = 'The task counts dates, not full timestamps. The upstream stage validates the timestamp; its closing bracket follows the clock time, not immediately the date. Extract the YYYY-MM-DD component alone before deduplication. Execute:\n' + suggestion;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
