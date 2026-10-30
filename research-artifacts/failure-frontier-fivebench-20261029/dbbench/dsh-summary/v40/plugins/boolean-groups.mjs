export const name='boolean-groups';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit},next)=>{
 await next();let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||'').trimStart().toUpperCase();
  if(!q.startsWith('SELECT')&&!q.startsWith('UPDATE'))return decision;
  const index=q.indexOf('WHERE');if(index<0)return decision;const predicate=q.slice(index+5);
  if(!predicate.includes(' AND ')||!predicate.includes(' OR ')||predicate.includes('('))return decision;
  warned=true;const reason='Check boolean scope: SQL AND binds more tightly than OR. This unparenthesized mix can let an OR branch bypass a shared year or other restriction. If the task requires every alternative to satisfy a common condition, group the alternatives in parentheses while retaining that common condition. Re-read the task and execute the intended query; a row from a different year does not prove the requested year has no match. This attempt did not execute; this reminder is issued once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
