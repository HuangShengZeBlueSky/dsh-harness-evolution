export const name='write-receipt';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();let completed='';
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(args?.query||''))return decision;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error||raw.content.trim()!=='[]')return decision;
  completed=args.query;
  const annotation='Database write receipt: the SQL statement executed successfully. [] is the normal result for a write and does not report how many rows changed. Do not repeat this completed write, especially INSERT, increments or appends. If the requested changes are all done, call the actual commit_final_answer tool now with {"answers":["Done"]}; if more distinct changes remain, perform those next.';
  audit({method_id:name,hook:'tools/post-execute',annotation});
  return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
 ac.on('system-prompt/assemble',async(assembly,context,next)=>{
  const result=await next();if(!completed)return result;
  const text='Last confirmed successful database write: '+completed+' . This write has already executed. Continue remaining distinct operations or submit with commit_final_answer; do not execute it again because a prose submission was not recognized.';
  audit({method_id:name,hook:'system-prompt/assemble',text});
  return {...result,sections:[...result.sections,{name,order:26,text,interpolate:false}]};
 });
});}
