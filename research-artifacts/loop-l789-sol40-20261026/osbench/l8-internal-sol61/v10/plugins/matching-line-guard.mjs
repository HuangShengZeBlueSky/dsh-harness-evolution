export const name = 'matching-line-guard';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const { ac, agent, audit } = payload;
    let task = '';
    let offered = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || offered || call.name !== 'bash_action') return decision;
      if (!task) task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .map(e => (e.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')).join('\n');
      const countsLines = /\b(?:number of|how many|count(?: the)?(?: total)?(?: number of)?)\s+(?:matching\s+)?lines\b/i.test(task);
      if (!countsLines || !/\b(?:contain(?:s|ing)?|match(?:es|ing)?|include(?:s|d|ing)?)\b/i.test(task)
        || /\b(?:unique|distinct)\b/i.test(task)) return decision;
      let args = call.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      const tokens = (args?.script || '').match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s|]+|\|/g) || [];
      const stages = [[]];
      for (const token of tokens) {
        if (token === '|') stages.push([]);
        else stages.at(-1).push(token);
      }
      for (let i = 0; i < stages.length; i++) {
        const grep = stages[i].indexOf('grep');
        if (grep < 0 || !stages[i].slice(grep + 1).some(t => /^(?:--files-with-matches|-[A-Za-z]*l[A-Za-z]*)$/.test(t))) continue;
        const countsDownstream = stages.slice(i + 1).some(stage => {
          const wc = stage.indexOf('wc');
          return wc >= 0 && stage.slice(wc + 1).some(t => /^(?:--lines|-[A-Za-z]*l[A-Za-z]*)$/.test(t));
        });
        if (!countsDownstream) continue;
        offered = true;
        const reason = 'The task asks for matching lines, but grep -l emits filenames. Counting that list counts files; running wc on those filenames counts all their lines. Remove -l from the original grep and count its matching-line output with plain wc -l, without xargs wc -l. Preserve every input path, recursion, pattern, case/whole-word option and date/file filter. Execute the corrected pipeline and submit its actual output through answer_action.';
        audit({ method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason });
        return { kind: 'deny', reason };
      }
      return decision;
    });
  });
}
