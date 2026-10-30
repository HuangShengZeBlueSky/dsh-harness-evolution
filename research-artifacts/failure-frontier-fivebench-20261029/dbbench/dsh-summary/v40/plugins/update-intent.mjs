export const name='update-intent';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const type=Array.isArray(taskContext?.type)?taskContext.type[0]:taskContext?.type;
 if(String(type).toUpperCase()!=='UPDATE'||/increas|decreas|increment|additional|more|add |adding|improv|reduc|append|extra/i.test(String(taskContext?.description||'')))return;
 let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(!/\bSET\s+(`[^`]+`|\w+)\s*=\s*\1\s*[+-]\s*\d/i.test(String(args?.query||'')))return decision;
  warned=true;const reason='Check update intent before executing: the task specifies a resulting value, while this SQL adds or subtracts from the current value. A stated total or corrected count usually requires assigning that value directly. Use arithmetic only when the task asks for a relative change. Re-read the request and submit the intended UPDATE. This attempt did not execute and the reminder is issued only once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
