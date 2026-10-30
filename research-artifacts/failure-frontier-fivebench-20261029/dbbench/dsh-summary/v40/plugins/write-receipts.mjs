export const name = 'write-receipts';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit,getRawBusinessResult,getVisibleInput},next) => {
    await next();
    let count=0, last='';
    ac.on('tools/post-execute', async (call,result,next) => {
      const decision=await next();
      if(decision.kind!=='accept'||call.name!=='execute_sql') return decision;
      const raw=getRawBusinessResult(call.callId);
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const query=String(args?.query||'');
      if(raw&&!raw.error&&!/^\d{4}\s*\(/.test(String(raw.content))&&/^\s*(INSERT|UPDATE|DELETE)\b/i.test(query)) {count++;last=query;}
      return decision;
    });
    ac.on('system-prompt/assemble', async (assembly,context,next) => {
      const result=await next();
      if(!count)return result;
      const recovery=(getVisibleInput()?.messages||[]).some(m=>m.role==='user'&&String(m.content).includes('No executable tool calls found'));
      const text=recovery
        ? `Protocol recovery: ${count} SQL writes already executed without database error. The last response printed a call in text; it did not submit. Use the native function tool commit_final_answer with a JSON OBJECT containing the answers array. Do not use a bare array as arguments. Do not print -commit_final_answer(...), XML, or code. Do not replay the completed INSERT. If the database work is complete, submit now through the tool interface.`
        : `Execution state: ${count} SQL write call(s) have executed without a database error. Most recent executed SQL: ${last}\nA write result [] gives no affected-row count; it does not mean the SQL was skipped. Check uncertain data with SELECT. Do not repeat an INSERT to fix a missing final tool call. When all requested database work is done, call commit_final_answer through the function calling interface, not as text/XML/code. A later "No executable tool calls found" message refers to that response, not to previously executed SQL.`;
      audit({method_id:name,hook:'system-prompt/assemble',text});
      const tools=recovery?result.tools.map(t=>t.name==='commit_final_answer'?{...t,description:t.description+' Submit using native function calling. Arguments are an object with an answers array, never a bare array. Printing a function expression in content does not invoke this tool.'}:t):result.tools;
      return {...result,tools,sections:[...result.sections,{name,order:27,text,interpolate:false}]};
    });
  });
}
