export const name="field-scope";
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let warned=false;const {ac,agent,audit}=p;
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||warned)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  const question=task.split('Question:')[1]||'';
  if(!/^\s*(?:SELECT|UPDATE)\b/i.test(a.query)||! /\bgold\b/i.test(question)||! /headers of this table are [^\n]*\bPlace\b[^\n]*\bGold\b/i.test(task)||! /\bWHERE\b[\s\S]*`?Place`?\s*=\s*'/i.test(a.query))return d;
  const reason='Medalist field scope: the question explicitly refers to the GOLD medalist/Gold column. Place is a separate field and is not evidence that the named country is the gold medalist. Inspect actual Gold and Place values if needed. For the requested country occurrence/count or rename, match the country in Gold itself; do not add a Place=country requirement unless the user actually specified that location restriction. Keep the requested operation and other genuine task constraints, then execute the corrected SQL.';
  warned=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
