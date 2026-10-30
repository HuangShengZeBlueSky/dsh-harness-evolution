export const name="contains-case";
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let warned=false;const {ac,agent,audit}=p;
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||warned)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  const question=task.split('Question:')[1]||'';
  if(!/^\s*UPDATE\b/i.test(a.query)||! /case-sensitive/i.test(question)||! /\bcontains?\b/i.test(question)||/\b(?:BINARY|COLLATE)\b/i.test(a.query))return d;
  const reason='Case-sensitive substring scope: the task asks whether a field CONTAINS the exact phrase with case preserved. Ordinary equality compares the whole cell, and default text comparisons may ignore case. SELECT actual field values first, then use an explicit case-sensitive substring condition, such as BINARY field LIKE the quoted percent-wrapped phrase or INSTR(BINARY field, the phrase)>0. Preserve existing text and the exact requested suffix when appending; execute the corrected UPDATE.';
  warned=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
