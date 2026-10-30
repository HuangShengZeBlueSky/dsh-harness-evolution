export const name='bounded-pattern';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const type=Array.isArray(taskContext?.type)?taskContext.type[0]:taskContext?.type;
 if(String(taskContext?.description||'').toUpperCase().includes('YYYY-MM-DD'))return;
 if(!/four[- ]digit/i.test(String(taskContext?.description||'')))return;
 let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||'');
  const upper=q.trimStart().toUpperCase();if(!upper.startsWith('UPDATE')||!upper.includes('LIKE')||['LENGTH','REGEXP','RLIKE'].some(x=>upper.includes(x)))return decision;
  warned=true;const reason='The task requires exact four-digit values and excludes multi-year or range strings. A prefix LIKE condition alone can match longer values. Constrain the whole value using an explicit length check or a fully anchored digit pattern, and group the conditions so other explicitly allowed values remain included. Recheck the request and execute the corrected UPDATE. This attempt did not execute; this reminder is issued only once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
