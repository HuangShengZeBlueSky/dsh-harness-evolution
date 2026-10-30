export const name = 'grep-pattern-recovery';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const { ac, audit, getRawBusinessResult } = payload;
    let warned = false;
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || warned || call.name !== 'bash_action') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      const feedback = String(raw.content ?? '');
      if (feedback.trim() && !/(?:^|\n)\s*0\s*$/.test(feedback) && !/output[^.\n]*empty/i.test(feedback)) return decision;
      let args = call.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      const script = args?.script || '';
      const tokens = script.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s|]+|\|/g) || [];
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] !== 'grep') continue;
        let end = tokens.indexOf('|', i + 1);
        if (end < 0) end = tokens.length;
        const parts = tokens.slice(i + 1, end);
        if (parts.some(t => /^(--perl-regexp|-[A-Za-z]*P[A-Za-z]*)$/.test(t))) continue;
        const extended = parts.some(t => /^(--extended-regexp|-[A-Za-z]*E[A-Za-z]*)$/.test(t));
        const pattern = parts.find(t => !t.startsWith('-')) || '';
        const digitClass = /\\+d\b/.test(pattern);
        const extendedQuantifier = !extended && pattern.includes('[0-9]') && /(?<!\\)\{\d+(?:,\d*)?\}/.test(pattern);
        if (!digitClass && !extendedQuantifier) continue;
        warned = true;
        const issue = digitClass
          ? 'The executed grep used \\d with basic/extended regex syntax; use [0-9] for decimal digits.'
          : 'The executed basic grep used an unescaped {n,m} numeric quantifier, which requires extended regex syntax.';
        const annotation = issue + ' Use grep -E with [0-9] and extended quantifiers/grouping, or extract a known field with awk. This zero/empty output does not yet establish that the files have no matching data. Inspect a few original lines, then recalculate while preserving every requested path, date/time filter and other condition. The verified result can still be zero. Use the actual tools to execute and submit.';
        audit({ method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation });
        return { ...decision, content: [...(decision.content || result.content), { type: 'text', text: annotation }] };
      }
      return decision;
    });
  });
}
