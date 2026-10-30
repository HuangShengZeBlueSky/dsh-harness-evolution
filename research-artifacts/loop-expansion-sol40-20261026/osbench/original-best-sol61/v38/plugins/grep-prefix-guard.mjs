export const name = 'grep-prefix-guard';
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
      if (seen.has(script) || !/\b(?:sort|uniq)\b/.test(script) || !/\bwc\s+-l\b/.test(script)) return decision;
      let changed = false;
      const corrected = script.replace(/\bgrep\s+([^|;\n]*)/g, (whole, tail, offset) => {
        const tokens = tail.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) || [];
        const operands = tokens.filter(t => !t.startsWith('-'));
        operands.shift();
        const fromXargs = /\bxargs(?:\s+-[^\s]+)*\s*$/.test(script.slice(0, offset));
        const multiple = fromXargs || operands.length > 1 || operands.some(t => /[*?]/.test(t)) || /(?:^|\s)-[A-Za-z]*[rR]/.test(tail);
        if (!multiple) return whole;
        if (/(?:^|\s)-[A-Za-z]*h[A-Za-z]*(?:\s|$)|--no-filename/.test(tail)) return whole;
        changed = true;
        return 'grep -h ' + tail;
      });
      if (!changed) return decision;
      seen.add(script);corrections++;
      const reason = 'Before counting unique values across files, suppress grep filename prefixes. Otherwise identical values from different files are distinct. Execute the same computation with -h:\n' + corrected;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
