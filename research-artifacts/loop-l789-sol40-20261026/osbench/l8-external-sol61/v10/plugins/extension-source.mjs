export const name = 'extension-source';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getRawBusinessResult} = payload;
    let used = false;
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || used || call.name !== 'bash_action') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || !/No such file or directory/.test(raw.content)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (!/^\s*grep\s/.test(script) || !/(?:^|\s)-[A-Za-z]*[rR][A-Za-z]*(?:\s|$)/.test(script.split('|')[0])) return decision;
      const pattern = /(^|\s)((?:~\/|\/)[^\s'"|]*?)\/\.(log|txt|py)(?=\s|$)/;
      const match = script.match(pattern);
      if (!match || !raw.content.includes(match[2] + '/.' + match[3])) return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (!new RegExp('\\.' + match[3] + '\\b', 'i').test(task)) return decision;
      const corrected = script.replace(pattern, (_, prefix, directory, extension) => prefix + "--include='*." + extension + "' " + directory);
      used = true;
      const annotation = '\n\nSource selection correction: the failed operand names a literal file called .' + match[3] + ', while the task asks for files with that extension inside the directory. Keep the existing recursive search, match pattern, options and counting pipeline, and select the extension with --include instead. Retry:\n' + corrected + '\nThe previous path error does not establish a zero matching-line count.';
      audit({method_id:name, hook:'tools/post-execute', call_id:call.callId, annotation});
      return {...decision, content:[...(decision.content || result.content), {type:'text', text:annotation}]};
    });
  });
}
