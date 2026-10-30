export const name = 'click-grounding';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, getRawBusinessResult} = payload;
    let allowed = null;
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      const page = typeof raw.content === 'string' ? raw.content : (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const match = page.match(/['"]clickables['"]\s*:\s*(\[[\s\S]*\])\s*\}/);
      allowed = match ? [...match[1].matchAll(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)].map(m => m[0].slice(1,-1).replace(/\\(['"\\])/g,'$1').toLowerCase()) : null;
      return decision;
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'click_action' || allowed === null) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const value = args.value.toLowerCase();
      if (allowed.includes(value)) return decision;
      const recovery = allowed.includes('< prev') ? 'Click "< prev" to inspect a different product if the required option is absent. Do not buy a product missing a required selection.' : allowed.includes('back to search') ? 'Click "back to search" to revise the search, or choose an exact action from the current Available Actions.' : 'Choose an exact value from the current Available Actions.';
      const reason = `Invalid click ${JSON.stringify(args.value)}: this value is absent from the current page's Available Actions. This call has not selected anything. ${recovery} Call a tool to continue.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
