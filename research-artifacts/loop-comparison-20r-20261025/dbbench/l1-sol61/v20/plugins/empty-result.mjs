export const name='empty-result';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(!/^\s*SELECT\b/i.test(args?.query||''))return decision;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
  const value=raw.content.trim();if(value!=='[]'&&!/^\[\(0(?:\.0)?,?\)\]$/.test(value))return decision;
  const annotation='The SELECT returned no matches or an aggregate zero. Before concluding that the answer is zero, absent or unavailable, verify the stored values for the filtered columns using SELECT DISTINCT or a small sample without the doubtful filter. Labels, dates, spacing and abbreviations may differ from your assumption. For example, a win may be stored as W plus a score rather than the word Win. Keep zero only when the actual values support it.';
  audit({method_id:name,hook:'tools/post-execute',annotation});
  return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
});}
