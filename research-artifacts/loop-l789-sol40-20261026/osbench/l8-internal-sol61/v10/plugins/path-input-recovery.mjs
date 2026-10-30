export const name = 'path-input-recovery';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const { ac, agent, audit, getRawBusinessResult } = payload;
    let warned = false;
    let task = '';
    let expansionOffered = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || expansionOffered || call.name !== 'bash_action') return decision;
      let args = call.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      const tokens = (args?.script || '').match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s|]+|\|/g) || [];
      const pathTools = ['find', 'ls', 'du', 'cat', 'wc', 'head', 'tail'];
      const predicates = ['-name', '-iname', '-path', '-ipath', '-regex', '-iregex'];
      let pathCommand = false;
      let blocked = false;
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (['|', ';', '&&', '||'].includes(token)) pathCommand = false;
        if (pathTools.includes(token)) pathCommand = true;
        if (!pathCommand || predicates.includes(tokens[i - 1])) continue;
        if (/^["']~\//.test(token) || /^(?:["'])?~\\+\//.test(token) || /^\\+~\//.test(token)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) return decision;
      if (!task) task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .map(e => (e.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')).join('\n');
      if (!/\bhome\b/i.test(task)) return decision;
      expansionOffered = true;
      const reason = 'This path quotes or escapes ~, preventing home-directory expansion. Use an unescaped ~/path or "$HOME/path" for the directory; keep filename wildcards outside the quoted directory portion. Do not escape the slash after ~. Find predicates such as -name are separate options, not wildcard paths. Locate the actual files before counting, preserve the requested extensions, recursion, file types and filters, and do not treat hidden errors or a pipeline zero as proof of missing data. Execute the corrected command and submit the actual result.';
      audit({ method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason });
      return { kind: 'deny', reason };
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || warned || call.name !== 'bash_action') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw) return decision;
      const feedback = String(raw.content ?? '');
      const missingInput = /(?:^|\n)(?:\/[^\s:]+\/)?(?:cat|grep|ls|find|du|wc|head|tail|sort|cut|awk|sed|zcat|gzip):[^\n]*(?:No such file or directory|Not a directory)/i;
      if (!missingInput.test(feedback)) return decision;
      warned = true;
      const annotation = '\nThe OS reported a missing input path. A trailing zero from this failed pipeline does not establish a zero count. Check the exact directory name and spelling in the request; locate/list that directory and its actual files first. Ensure the shell expands ~ and filename globs: quote the directory portion separately from the wildcard. An extension alone is not a filename. Then recompute with the discovered paths, preserving all requested files, subdirectories and filters. Do not hide the error, broaden the scope or abandon the task because of an unverified path. Execute and submit through the actual tools.';
      audit({ method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation });
      return { ...decision, content: [...(decision.content || result.content), { type: 'text', text: annotation }] };
    });
  });
}
