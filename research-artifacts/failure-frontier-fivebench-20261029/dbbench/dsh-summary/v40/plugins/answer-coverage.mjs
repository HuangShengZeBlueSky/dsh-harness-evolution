export const name='answer-coverage';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
 await next();const type=Array.isArray(taskContext?.type)?taskContext.type[0]:taskContext?.type;
 if(String(type).toUpperCase()!=='SELECT'||!/for each|display both|each qualifying|provide a list|find all records|display their/i.test(String(taskContext?.description||'')))return;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,raw=getRawBusinessResult(call.callId);
  if(!raw||raw.error||!/^\s*SELECT\b/i.test(String(args?.query||''))||!String(raw.content).startsWith('[('))return decision;
  const annotation='Submission coverage: the actual commit_final_answer arguments must contain every field the question requests for each matching record. For multi-column records, use one answers string per returned row in the exact tuple text shown by the SQL result, retaining field order, quotes and value text. Do not invent a new comma-joined or prose serialization. Preserve repeated rows. For a single requested field, submit the value itself. Listing details only in response prose does not submit them. If the question asks for both a count and record details, submit both; a count alone omits the requested records. Do not add auxiliary columns that were not requested.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
});}
