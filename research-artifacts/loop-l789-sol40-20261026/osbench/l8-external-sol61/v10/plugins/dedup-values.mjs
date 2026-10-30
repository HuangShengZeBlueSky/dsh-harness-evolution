export const name = 'dedup-values';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit} = payload;
    let intervened = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || intervened || call.name !== 'bash_action') return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (!/unique|distinct/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (!/\b(?:sort\b[^|]*-u|uniq\b)/.test(script)) return decision;
      const extraction = script.split('|').some(segment => {
        if (!/\bgrep\b/.test(segment) || !/\s-[A-Za-z]*o[A-Za-z]*(?:\s|$)/.test(segment)) return false;
        if (/\s-[A-Za-z]*h[A-Za-z]*(?:\s|$)|--no-filename\b/.test(segment)) return false;
        if (/\bxargs\b/.test(segment)) return true;
        const tail = segment.slice(segment.indexOf('grep') + 4);
        const words = tail.match(/'[^']*'|"[^"]*"|[^\s]+/g) || [];
        const operands = words.filter(w => !w.startsWith('-') && !/^\d*[<>]/.test(w)).slice(1);
        return operands.length > 1 || operands.some(w => /[*?]/.test(w));
      });
      if (!extraction) return decision;
      intervened = true;
      const reason = 'Multi-file grep -o prefixes extracted values with filenames, so sort/uniq can count (file,value) pairs rather than globally unique values. Retry the same pipeline adding -h to that grep extraction. Keep its pattern, other options, file scope and filters unchanged.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
