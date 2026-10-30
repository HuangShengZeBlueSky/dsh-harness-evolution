export const name = 'find-line-count-check';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    let intervened = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || intervened || call.name !== 'bash_action') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = String(args?.script || '');
      if (!/^\s*find\b[^|]*\|\s*wc\s+-l\b/.test(script) || /-exec|-execdir|\bxargs\b/.test(script)) return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message').flatMap(e => (e.data.content || []).filter(b => b.type === 'text').map(b => b.text)).join('\n');
      if (!/total (?:number of |combined )?lines/i.test(task) || !/files/i.test(task)) return decision;
      intervened = true;
      const corrected = script.replace(/-not\s+-follow\b/g,'').replace(/\|\s*wc\s+-l\b/, '-exec cat {} + | wc -l');
      const reason = 'find prints file paths; wc -l currently counts selected files, whereas the task asks for their content line total. Read selected regular file contents before counting. find does not follow symbolic links by default (-P); -not -follow is not the correct way to express that policy. Preserve all directory, filename and time filters. Execute this corrected content count: ' + corrected;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
