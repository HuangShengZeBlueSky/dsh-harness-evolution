export const name = 'matching-line-guard';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    let corrected = false;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || corrected) return decision;
      const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const task = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
      if (!/\blines\b/i.test(task) || !/\b(?:count|number|total|how many)\b/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (!/\bwc\s+-l\b/.test(script)) return decision;
      let changed = false;
      let suggestion = script.replace(/\bgrep\s+([^|;\n]*)/g, (whole, tail) => {
        if (!/(?:^|\s)-[A-Za-z]*l[A-Za-z]*(?:\s|$)/.test(tail)) return whole;
        changed = true;
        return 'grep -h ' + tail.replace(/(^|\s)-([A-Za-z]+)(?=\s|$)/g, (flag, space, letters) => {
          const keep = letters.replaceAll('l','');
          return space + (keep ? '-' + keep : '');
        });
      });
      let contentIssue = false;
      if (!changed && /^\s*find\b/.test(script)) {
        if (/^\s*find\b[^|]*\|\s*wc\s+-l\s*$/.test(script) && !/-(?:exec|print)/.test(script)) {
          suggestion = script.replace(/\|\s*wc\s+-l\s*$/, '-exec cat {} + | wc -l');
          changed = true;
          contentIssue = true;
        } else if (/\bwhile\s+read\b/.test(script)) {
          suggestion = script.replace(/\becho\s+("\$[A-Za-z_]\w*"|\$\{?[A-Za-z_]\w*\}?)/g, 'cat $1');
          changed = suggestion !== script;
          contentIssue = changed;
        }
      }
      if (!changed) return decision;
      suggestion = suggestion.replace(/\|\s*xargs\s+wc\s+-l/g, '| wc -l');
      corrected = true;
      const reason = contentIssue
        ? 'The task asks for file CONTENT LINES. find and echo emit filenames, so wc -l currently counts files. Keep the same file selection and exclusions, read the selected files, and count their content lines. Execute:\n' + suggestion
        : 'The task asks for matching LINES. grep -l emits filenames, so counting those or all lines of those files counts the wrong object. Emit matching lines and count that stream. Use:\n' + suggestion;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
