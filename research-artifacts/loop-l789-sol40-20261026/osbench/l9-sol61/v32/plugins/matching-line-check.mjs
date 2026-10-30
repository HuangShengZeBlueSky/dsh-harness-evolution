export const name = 'matching-line-check';

export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    let intervened = false;

    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || intervened) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = String(args?.script || '');
      const listsFiles = /\bgrep\b[^|;\n]*\s-[A-Za-z]*l[A-Za-z]*\b/.test(script)
        || /\bgrep\b[^|;\n]*--files-with-matches\b/.test(script);
      if (!listsFiles || !/\|\s*(?:xargs\s+)?wc\s+-l\b/.test(script)) return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => (e.data.content || []).filter(b => b.type === 'text').map(b => b.text)).join('\n');
      const lineRequest = /\b(?:count|how many|number of|total)\s+(?:(?:the|total|number|of)\s+)*lines\b/i.test(task);
      const matchingLines = /\blines\b[^.!?\n]*\bcontain(?:s|ing)?\b/i.test(task);
      const wholeFiles = /\bfiles?\s+(?:that|which)\s+contain/i.test(task);
      if (!lineRequest || !matchingLines || wholeFiles) return decision;

      intervened = true;
      const reason = 'grep -l produces filenames, but this task asks for matching lines. Remove -l and pipe the matching lines to wc -l. Do not count the filenames or feed matched filenames into wc -l, which counts entire files. Retain the requested source scope, date filters and case/word matching rules.';
      audit({method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason});
      return {kind: 'deny', reason};
    });
  });
}
