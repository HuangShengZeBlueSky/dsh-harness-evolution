export const name = 'date-value-contract';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    let used = false;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || used) return decision;
      const first = agent.session.snapshotEvents().find(e=>e.type==='user/message');
      const task = (first?.data?.content || []).filter(b=>b.type==='text').map(b=>b.text).join(' ');
      if (!/\b(?:unique|distinct)\s+(?:dates|days)\b/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (!/\bwc\s+-l\b/.test(script) || !/\b(?:sort|uniq)\b/.test(script)) return decision;
      const command = script.replace(/\bcut\s+-d\s*(['"]) \1\s+-f\s*1-(?=\s|$)/g, 'cut -d" " -f1');
      if (command === script) return decision;
      used = true;
      const reason = 'The reduction counts distinct calendar dates, not full timestamps. cut -f1- retains the clock and every later field, so two events on the same date remain different values. Select only the first date field before the existing global deduplication. Execute:\n' + command;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
