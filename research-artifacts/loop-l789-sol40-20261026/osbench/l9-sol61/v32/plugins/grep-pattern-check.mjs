export const name = 'grep-pattern-check';

export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    let intervened = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || intervened) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = String(args?.script || '');
      const segments = script.match(/\bgrep\b[^|;\n]*/g) || [];
      let reason = '';
      for (const segment of segments) {
        const flags = letter => new RegExp('\\s-[A-Za-z]*' + letter + '[A-Za-z]*\\b').test(segment);
        if (flags('E') && !flags('P') && /\\+d/.test(segment)) {
          const corrected = script.replace(segment, segment.replace(/\\+d/g, '[0-9]'));
          reason = 'grep -E uses extended regular expressions: backslash-d is not a decimal digit class in this mode. Use [0-9] for digits. Reissue this command with only that syntax correction, retaining the requested files, filters and aggregation:\n' + corrected;
          break;
        }
        if (flags('F')) continue;
        const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
          .flatMap(e => (e.data.content || []).filter(b => b.type === 'text').map(b => b.text)).join('\n');
        const labels = [...segment.matchAll(/(?<!\\)\[([A-Z][A-Z_]+)\]/g)];
        const label = labels.find(m => task.includes(m[0]));
        if (label) {
          reason = `The task specifies the literal marker ${label[0]}, but unescaped square brackets in a grep regex form a character class and can match other log levels. If the whole pattern is this literal marker, use grep -F instead of regex mode, preserving count/case flags. If the pattern also needs regex syntax, escape both brackets. Keep the requested file scope and count actual matching records.`;
          break;
        }
      }
      if (!reason) return decision;
      intervened = true;
      audit({method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason});
      return {kind: 'deny', reason};
    });
  });
}
