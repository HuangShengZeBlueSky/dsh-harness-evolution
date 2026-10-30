export const name = 'shell-path-recovery';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit}, next) => {
    await next();
    const seen = new Set();
    let corrections = 0;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || corrections >= 2) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (seen.has(script) || !/\b(?:find|ls|du|stat|cat)\b/.test(script)) return decision;
      const suggestion = script.replace(/~\\+\//g, '$HOME/').replace(/\\+\*-name\b/g, '-name').replace(/(["'])~\1/g, '"$HOME"');
      if (suggestion === script) return decision;
      seen.add(script);corrections++;
      const reason = 'Shell path expansion needs correction: an escaped slash after ~ or a quoted ~ stays literal; use $HOME. The find option is -name, not an escaped *-name token. Keep the task scope and rerun this corrected command:\n' + suggestion;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
