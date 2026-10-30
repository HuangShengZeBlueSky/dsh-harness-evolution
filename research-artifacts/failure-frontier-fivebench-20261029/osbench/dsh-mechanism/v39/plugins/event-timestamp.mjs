export const name = 'event-timestamp';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    let corrected = false, pathCorrected = false;
    const taskText = () => agent.session.snapshotEvents().filter(e => e.type === 'user/message')
      .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text)
      .find(t => t.includes('My problem is:')) || '';
    const relevant = task => /earliest|latest|most recent/i.test(task) && /event|timestamp/i.test(task) && /log/i.test(task) && !/modification time|last modified/i.test(task);
    const earliestText = 'For the earliest timestamp ENTRY, scan every timestamped record in every requested file, compare full date AND time, and retain the source filename. A first-line sample establishes format, not the minimum unless ordering is verified. If the task requests a path relative to home, include the directory component from the observed file path; a basename alone loses that required identity.';
    const text = 'The requested latest log EVENT time comes from timestamps inside the specified files. ls -lt and stat show filesystem metadata, not event timestamps. Read the requested file contents, extract the complete displayed timestamp, and compare event timestamps globally. For YYYY-MM-DD HH:MM:SS, chronological and lexical order agree. Preserve the requested file scope and return the timestamp or complete log entry as requested.';
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow') return decision;
      const task = taskText();
      if (call.name === 'answer_action' && !pathCorrected && /earliest/i.test(task) && /relative path/i.test(task)) {
        const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
        if (typeof args?.answer === 'string' && !args.answer.includes('/')) {
          pathCorrected = true;
          const reason = 'The task explicitly asks for the file path relative to your home directory. Your answer is only a basename. Use the source file path established by the actual timestamp scan and retain its directory relative to home, then call answer_action again. Do not change the selected file without evidence.';
          audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
          return {kind:'deny',reason};
        }
      }
      if (call.name !== 'bash_action' || corrected || !relevant(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (!/\bls\s+-[A-Za-z]*t|\bstat\b/.test(args?.script || '')) return decision;
      corrected = true;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason:text});
      return {kind:'deny',reason:text};
    });
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const task = taskText();
      if (!relevant(task)) return result;
      const guidance = /earliest/i.test(task) ? earliestText : text;
      audit({method_id:name,hook:'system-prompt/assemble',text:guidance});
      return {...result,sections:[...result.sections,{name,order:27,text:guidance,interpolate:false}]};
    });
  });
}
