export const name = 'shell-path-check';

export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    let intervened = false;

    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || intervened) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = String(args?.script || '');
      let reason = '';
      if (/~\\+\//.test(script) || /["']~\//.test(script)) {
        reason = 'This command quotes or escapes the home-directory tilde, so it becomes a literal path. Use $HOME for the requested home directory, quote the directory portion and leave filename wildcards outside the quotes. For find, write -name as an option, without a prefixed wildcard. Reissue the corrected command with the same requested scope and matching rule.';
      } else if (/\bgrep\b/.test(script)) {
        const match = script.match(/((?:\/[^\/\s'"|;]+)+)\/\.(log|txt|py)(?=$|[\s'"|;])/);
        const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
          .flatMap(e => (e.data.content || []).filter(b => b.type === 'text').map(b => b.text)).join('\n');
        if (match && /all|files|extension/i.test(task)) {
          reason = `This command reads the literal file ${match[1]}/.${match[2]}, while the task asks for files with that extension. List the requested directory and select *.${match[2]} files. For recursion, use grep -r --include='*.${match[2]}' with the requested directory, preserving the original matching flags and requested count.`;
        }
      }
      if (!reason) return decision;
      intervened = true;
      audit({method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason});
      return {kind: 'deny', reason};
    });
  });
}
