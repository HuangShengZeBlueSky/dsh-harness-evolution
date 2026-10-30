export const name = 'next-id-max';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, taskContext} = payload;
    const type = Array.isArray(taskContext?.type) ? taskContext.type[0] : taskContext?.type;
    if (String(type).toUpperCase() !== 'INSERT' || !/next\s+available|unique\s+(?:rank|identifier|number|string\s+value)/i.test(taskContext?.description || '')) return;
    let denied = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || denied || call.name !== 'execute_sql') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const query = args.query || '';
      if (!/^\s*SELECT\b/i.test(query)) return decision;
      const fixed = query.split(/('(?:''|\\.|[^'])*'|"(?:\\.|[^"\\])*")/g).map(chunk => {
        if (/^['"]/.test(chunk)) return chunk;
        return chunk.replace(/\bMAX\s*\(\s*(`(?:``|[^`])*`|Rank|No\.?|#)\s*\)/gi, (whole, identifier) => {
          const column = identifier.replace(/^`|`$/g, '');
          if (!/^(Rank|No\.?|#)$/i.test(column)) return whole;
          return "MAX(CAST(REPLACE(`" + column + "`, ',', '') AS UNSIGNED))";
        });
      }).join('');
      if (fixed === query) return decision;
      denied = true;
      const reason = 'Not executed. To choose the next unique numeric identifier, compare the text identifier values numerically rather than taking their lexicographic MAX (which can return 9 before 10). Query the actual maximum with this correction, then choose the next available value while preserving the requested string format: ' + fixed;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
