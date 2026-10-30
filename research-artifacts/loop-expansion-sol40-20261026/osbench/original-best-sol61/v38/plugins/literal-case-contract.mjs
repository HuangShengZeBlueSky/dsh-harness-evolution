export const name = 'literal-case-contract';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    let used = false;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || used) return decision;
      const first = agent.session.snapshotEvents().find(e=>e.type==='user/message');
      const task = (first?.data?.content || []).filter(b=>b.type==='text').map(b=>b.text).join(' ');
      if (!/ignore\s+case|case.insensitive/i.test(task)) return decision;
      const term = /\bword\s+["'`]([^"'`\n]+)["'`]/i.exec(task)?.[1];
      if (!term) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      let changed = false;
      const command = script.replace(/\bgrep\s+((?:-[A-Za-z]+\s+)*)(['"])(.*?)\2/g, (whole, flags, quote, pattern) => {
        if (flags.includes('i') || pattern.toLowerCase() !== term.toLowerCase()) return whole;
        changed = true;
        return 'grep -i ' + flags + quote + pattern + quote;
      });
      if (!changed) return decision;
      used = true;
      const reason = 'The task explicitly requests case-insensitive matching of the literal word ' + term + '. Preserve the file selection and use grep -i for that requested content filter. Execute:\n' + command;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
