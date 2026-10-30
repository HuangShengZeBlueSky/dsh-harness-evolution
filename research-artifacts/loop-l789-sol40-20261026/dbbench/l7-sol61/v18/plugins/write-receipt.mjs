export const name = 'write-receipt';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (p, next) => {
    await next();
    p.ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(args.query || '')) return decision;
      const raw = p.getRawBusinessResult(call.callId);
      if (!raw || raw.error || result.isError || String(raw.content).trim() !== '[]') return decision;
      const annotation = '\nWrite execution receipt: this SQL statement executed without a database error. An empty [] is normal for INSERT/UPDATE/DELETE; it does not report the affected row count. Complete any remaining requested changes once. When all requested operations are done, make an actual commit_final_answer tool call with an object such as {"answers": []}. Writing the tool name in prose does not submit. Do not repeat this write merely to produce another tool call.';
      p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
}
