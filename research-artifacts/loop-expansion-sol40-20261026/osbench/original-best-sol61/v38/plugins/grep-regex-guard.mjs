export const name = 'grep-regex-guard';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit}, next) => {
    await next();
    let corrections = 0;
    const seen = new Set();
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || corrections >= 2) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (seen.has(script)) return decision;
      let changed = false;
      const suggestion = script.replace(/\bgrep\s+([^|;\n]*)/g, (whole, tail) => {
        const flags = /^(?:-[A-Za-z]+\s+)*/.exec(tail)[0];
        if (flags.includes('P') || !/\\+d\b/.test(tail)) return whole;
        changed = true;
        let fixed = tail.replace(/\\+d\b/g, '[0-9]').replace(/\\+([{}()])/g, '$1').replace(/\\+([\[\]])/g, '\\$1');
        return 'grep ' + (flags.includes('E') ? '' : '-E ') + fixed;
      });
      if (!changed) return decision;
      seen.add(script);corrections++;
      const reason = 'Use grep -E with [0-9] for digits and unescaped {n} quantifiers. Keep the same anchors and filters. Execute this corrected command exactly:\n' + suggestion;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
