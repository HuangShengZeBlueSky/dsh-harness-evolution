export const name="suffix-scope";
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let warned=false;const {ac,agent,audit}=p;
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||warned)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  const question=task.split('Question:')[1]||'';
  if(!/^\s*UPDATE\b/i.test(a.query)||!/(?:ends? with a dash|open-ended)/i.test(question)||! /LIKE\s*'%[-–—]%'/i.test(a.query))return d;
const reason='Suffix scope: the task targets a term ENDING with a dash, while this WHERE contains a dash anywhere and can change closed date ranges. First SELECT actual candidate terms and observe the exact trailing dash/spacing; use an anchored trailing-dash condition such as a suffix LIKE or end-anchored REGEXP, excluding completed dates and Present. Append only to verified open-ended terms, then execute the corrected write.';
  warned=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
