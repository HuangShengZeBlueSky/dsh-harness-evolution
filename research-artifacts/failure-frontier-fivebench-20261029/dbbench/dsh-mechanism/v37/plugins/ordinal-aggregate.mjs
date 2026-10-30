export const name='ordinal-aggregate';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let warned=false;
  const {ac,agent,audit}=p;
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||warned)return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
   const question=task.split('Question:')[1]||'';
   if(!/\b(?:sum|total)\b/i.test(question)||! /\b\d+(?:st|nd|rd|th)\b/i.test(question)||! /^\s*SELECT\b/i.test(a.query)||! /\bOFFSET\b/i.test(a.query))return d;
   warned=true;
   const reason='Aggregate/category check: the task asks for a sum or total with an ordinal condition, while this query returns one row by OFFSET. An ordinal such as a finishing result can be a stored category, not a row position. Inspect DISTINCT values of the relevant condition column, map the requested ordinal to its observed value, then apply that filter and the requested SUM/aggregate. Do not substitute the nth row for a category aggregate unless the task actually asks for a row position.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
