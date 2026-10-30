export const name = 'temporal-comparison-guard';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit,getRawBusinessResult}, next) => {
    await next();
    let cutoff = null;
    let relation = null;
    let used = false;
    ac.on('tools/post-execute', async (call, result, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'accept' || call.name !== 'bash_action') return decision;
      const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const task = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
      const direction = /\b(after|before)\b/i.exec(task)?.[1]?.toLowerCase();
      if (!direction || !/\b(?:last|latest|first|earliest)\b.*\b(?:entry|record|timestamp)\b/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const raw = getRawBusinessResult(call.callId);
      if (!/\b(?:tail|head)\b/.test(args.script || '') || !raw || raw.error) return decision;
      const text = typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content);
      const stamp = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\b/.exec(text)?.[0];
      if (stamp) {
        cutoff = stamp;relation = direction;
        audit({method_id:name,hook:'tools/post-execute',reference:cutoff,relation});
      }
      return decision;
    });
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || !cutoff || used) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (!/\|\s*wc\s+-l\s*$/.test(script) || !/\bgrep\b[^|]*\s-[A-Za-z]*o[A-Za-z]*(?:\s|$)/.test(script) || /\b(?:awk|python3?|perl|date)\b/.test(script)) return decision;
      const operator = relation === 'after' ? '>' : '<';
      const filter = `awk -v cutoff='${cutoff}' 'substr($0,1,length(cutoff)) ${operator} cutoff {n++} END {print n+0}'`;
      const suggestion = script.replace(/\|\s*wc\s+-l\s*$/, '| ' + filter);
      used = true;
      const reason = 'The reference timestamp actually read was ' + cutoff + '. This pipeline only counts timestamp-shaped values and omits the required ' + relation + ' comparison. Preserve the input stream and compare each full timestamp before counting. Execute:\n' + suggestion;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
