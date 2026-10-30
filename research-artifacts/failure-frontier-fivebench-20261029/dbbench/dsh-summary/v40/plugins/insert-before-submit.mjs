export const name='insert-before-submit';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
 await next();const tags=Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type];
 if(!tags.some(t=>String(t).trim().toUpperCase()==='INSERT')&&!String(taskContext?.description||'').toUpperCase().includes('INSERT INTO'))return;
 let inserted=false,warned=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,raw=getRawBusinessResult(call.callId);
  if(raw&&!raw.error&&String(raw.content).trimStart().startsWith('[')&&String(args?.query||'').trimStart().toUpperCase().startsWith('INSERT'))inserted=true;return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='commit_final_answer'||inserted||warned)return decision;
  warned=true;const reason='This task has explicit INSERT intent, but no successful INSERT execution has been observed. A description of a record or a statement that it was added is not a database execution receipt. If the supplied information is sufficient, perform the requested INSERT with the native SQL tool before claiming completion. If required facts are genuinely missing, state that honestly; do not invent data just to satisfy this check. This submission did not execute; this reminder is issued once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
