export const name='result-literals';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,raw=getRawBusinessResult(call.callId),minus=String.fromCodePoint(8722);
  if(!raw||raw.error||!String(args?.query||'').trimStart().toUpperCase().startsWith('SELECT')||!String(raw.content).includes(minus))return decision;
  const annotation='Returned text contains the Unicode minus character '+minus+' (U+2212), which differs from the ASCII hyphen -. When the task asks you to return a stored text value, copy its original characters exactly; do not normalize the minus sign. First identify the row using every requested condition. This is a reminder about faithful text copying, not a request to invent a value or change arithmetic when arithmetic is actually asked for.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
});}
