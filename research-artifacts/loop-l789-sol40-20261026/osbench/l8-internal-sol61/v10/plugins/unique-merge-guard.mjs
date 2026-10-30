export const name = 'unique-merge-guard';
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
      if (!/\b(unique|distinct)\b/i.test(task) || !/\bfiles\b/i.test(task) || /once per file|within each file|per-file/i.test(task)) return decision;
      let args = call.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      const script = args?.script || '';
      if (!/\b(sort|uniq)\b/.test(script)) return decision;
      const tokens = script.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s|]+|\|/g) || [];
      for (let i = 0; i < tokens.length; i++) {
        if (tokens[i] !== 'grep') continue;
        let end = tokens.indexOf('|', i + 1);
        if (end < 0) end = tokens.length;
        const grepArgs = tokens.slice(i + 1, end);
        if (grepArgs.some(t => /^(--no-filename|-[A-Za-z]*h[A-Za-z]*)$/.test(t))) continue;
        if (grepArgs.some(t => ['-e', '-f', '--regexp', '--file'].includes(t))) continue;
        const files = grepArgs.filter(t => !t.startsWith('-') && !/^\d*[<>]/.test(t)).slice(1);
        const before = tokens.slice(0, i);
        const stagePrefix = before.slice(before.lastIndexOf('|') + 1);
        const multiple = stagePrefix.includes('xargs') || files.length > 1 || files.some(t => !/^['"]/.test(t) && /[*?\[]/.test(t));
        if (!multiple) continue;
        offered = true;
        const reason = 'This multi-file grep can prepend filenames before deduplication, counting filename:value pairs instead of unique entities. Reissue the extraction with grep -h (or concatenate inputs before grep), then deduplicate/count. Preserve the requested paths, filters and entity field. Read the corrected command output before answer_action.';
        audit({ method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason });
        return { kind: 'deny', reason };
      }
      return decision;
    });
  });
}
