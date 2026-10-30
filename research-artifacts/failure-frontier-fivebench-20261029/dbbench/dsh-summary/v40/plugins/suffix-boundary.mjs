export const name='suffix-boundary';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const description=String(taskContext?.description||'').toLowerCase();if(!description.includes('ends with')||!description.includes('dash'))return;
 let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||'').trim(),upper=q.toUpperCase();
  if(!['SELECT','UPDATE'].some(v=>upper.startsWith(v)))return decision;
  const quote=String.fromCharCode(39),parts=q.split(quote),dashes=['-',String.fromCodePoint(8211),String.fromCodePoint(8212)];
  const wrong=parts.some((v,i)=>i%2===1&&v.startsWith('%')&&v.endsWith('%')&&dashes.includes(v.slice(1,-1))&&parts[i-1].trimEnd().toUpperCase().endsWith('LIKE'));
  if(!wrong)return decision;warned=true;
  const reason='The request specifies a value that ENDS WITH a dash. The proposed LIKE pattern has a percent wildcard on both sides of the dash, so it tests containment and can select closed date ranges. Check the actual suffix instead, preserving all other requested conditions. If the stored dash character or trailing spacing is unclear, inspect real values before choosing the suffix comparison. Do not infer that no open-ended records exist from the containment query. This SQL did not execute; this boundary reminder is issued once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
