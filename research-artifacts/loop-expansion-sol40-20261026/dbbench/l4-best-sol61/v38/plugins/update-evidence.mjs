export const name='update-evidence';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();let observed=false,blocked='',reminded=false,commitReminded=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query??'');
  const raw=String(getRawBusinessResult(call.callId)?.content??'').trim();
  if(/^\s*SELECT\b/i.test(q)&&!/(?:COUNT|MAX|MIN|AVG|SUM)\s*\(/i.test(q)&&raw.startsWith('[('))observed=true;
  if(/^\s*UPDATE\b/i.test(q)&&raw==='[]')blocked='';return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow')return d;let reason='';
  if(call.name==='execute_sql'&&!observed&&!reminded){
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query??'');
   const m=q.match(/^\s*UPDATE\s+(`[^`]+`|\w+)/i);
   if(m){reminded=true;blocked=q;reason='Update field evidence: inspect stored row values before this UPDATE, even when old/new strings occur in the task. An entity such as a raceway can belong to Circuit rather than Location. Execute SELECT * FROM '+m[1]+' LIMIT 3; then map the target entity to its actual column and run the intended UPDATE. A sample does not establish global absence. The blocked statement has not executed.';}
  }else if(call.name==='commit_final_answer'&&blocked&&!commitReminded){commitReminded=true;reason='The blocked UPDATE has not executed. Complete the requested conditional UPDATE using the inspected column/value representations before committing. Do not replace execution with a sample-absence claim. Original intended SQL: '+blocked;}
  if(!reason)return d;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
