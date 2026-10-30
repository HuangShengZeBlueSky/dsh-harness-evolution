export const name='mutation-contract';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!String(p.taskContext?.type||'').toUpperCase().includes('INSERT'))return;
 let inserted=false,used=false;
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,raw=p.getRawBusinessResult(call.callId);
  if(/^\s*INSERT\b/i.test(a?.query||'')&&raw&&!raw.error&&!/^\s*\d{4}\s*\(/.test(String(raw.content)))inserted=true;return d;
 });
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||inserted||call.name!=='commit_final_answer')return d;used=true;
  const reason='Public task operation is INSERT, but no INSERT has actually executed successfully in this task. Narrative past-tense wording is not an execution receipt. Use execute_sql to add the described record, inspecting existing storage format if needed, then commit. Do not invent unspecified data. This reminder is limited to once.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
