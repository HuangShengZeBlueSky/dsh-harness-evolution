export const name='numeric-sequence';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();
  if(!/next available|current highest|unique rank|unique.*(?:identifier|number)/i.test(String(taskContext?.description||'')))return;
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const result=await next();
   const text='When allocating the next numeric identifier/rank, MAX on a TEXT column is lexicographic, not numeric. Inspect the existing numbering pattern and use MAX(CAST(`actual sequence column` AS UNSIGNED)) for numeric sequence values. Ignore nonnumeric summary rows when finding numeric maxima, preserve any required prefix/suffix when forming the new string, and check the proposed identifiers are unused. Do not choose arbitrary large ranks to avoid checking the sequence.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...result,sections:[...result.sections,{name,order:28,text,interpolate:false}]};
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const q=String(args?.query||'');const raw=getRawBusinessResult(call.callId);
   if(!raw||raw.error||!/^\s*SELECT\b/i.test(q)||! /\bMAX\s*\(/i.test(q)||/\bCAST\s*\(/i.test(q))return decision;
   const annotation='Sequence check: this MAX query compares the stored text. Its result may be a summary label or lexicographically largest string, not the largest numeric identifier. Query the numeric maximum with CAST after checking the numbering format before assigning new unique identifiers.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
