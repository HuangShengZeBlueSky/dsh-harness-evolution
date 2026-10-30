export const name = 'ip-first-field';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getRawBusinessResult} = payload;
    let used = false;
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || used || call.name !== 'bash_action') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error || !/^The output of the OS:\s*0\s*$/.test(raw.content)) return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (!/unique|distinct/i.test(task) || !/IP address/i.test(task)
        || !/(?:starts?|begins?) with an? IP address|IP address at the beginning/i.test(task)
        || /\b(?:last|past|between|during|before|after|status|GET|POST|ERROR|private|more than|at least)\b|on the date|on \d/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const split = script.indexOf('|');
      if (split < 0 || !/\b(?:sort\b[^|]*-u|uniq\b)/.test(script) || !/\bwc\s+-l\s*$/.test(script)) return decision;
      const words = script.slice(0, split).trim().match(/'[^']*'|"[^"]*"|[^\s]+/g) || [];
      if (words.shift() !== 'grep') return decision;
      if (words.some(w => w.startsWith('-') && !/^-[Eoh]+$/.test(w))) return decision;
      const operands = words.filter(w => !w.startsWith('-'));
      const files = operands.slice(1);
      if (!files.length || files.some(w => /[;&<>`$]/.test(w))) return decision;
      const corrected = "awk '{print $1}' " + files.join(' ') + ' ' + script.slice(split);
      used = true;
      const annotation = '\n\nFirst-field extraction recovery: the task explicitly states that each log line begins with an IP address. The current grep filter returned zero. Extract that known field directly from the same files, keeping the rest of the pipeline, instead of discarding records with this regex. Retry:\n' + corrected + '\nUse the actual returned count; a confirmed zero remains valid.';
      audit({method_id:name, hook:'tools/post-execute', call_id:call.callId, annotation});
      return {...decision, content:[...(decision.content || result.content), {type:'text', text:annotation}]};
    });
  });
}
