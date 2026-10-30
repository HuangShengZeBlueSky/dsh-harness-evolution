export const name='date-order';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!/\b(first|last|latest|earliest|recent)\b/i.test(String(p.taskContext?.description||'')))return;let used=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query||'');
  if(!/ORDER\s+BY\s+(`[^`]*date[^`]*`|[A-Za-z_]*date)/i.test(q)||/STR_TO_DATE|CAST\s*\(/i.test(q))return d;used=true;
  const reason='Chronology planning reminder: no query was executed. These database fields are TEXT, so ordering a day/month/year date string directly is not chronological. Inspect actual Date values and the relevant event/outcome column first; select a STR_TO_DATE format matching the observed strings, then order the parsed date. Preserve the question filter: a nonempty Score alone does not establish a win. Do not guess a date format or event label. This reminder occurs once.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
