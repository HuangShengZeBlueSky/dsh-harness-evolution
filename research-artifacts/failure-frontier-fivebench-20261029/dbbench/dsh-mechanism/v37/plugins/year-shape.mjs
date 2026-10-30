export const name='year-shape';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let warned=false;
  const {ac,agent,audit}=p;
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||warned)return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
   const question=task.split('Question:')[1]||'';
   if(!/four-digit/i.test(question)||! /(?:multi-year|range)/i.test(question)||! /^\s*UPDATE\b/i.test(a.query)||! /\bLIKE\b/i.test(a.query)||/\b(?:REGEXP|RLIKE|LENGTH|CHAR_LENGTH)\b/i.test(a.query))return d;
   warned=true;
   const reason='Year shape constraint: the task explicitly limits updates to exact four-digit year strings and excludes ranges or multi-year values. A prefix LIKE condition alone also matches longer strings. Preview the actual year values and constrain the year to exactly four digits, for example an anchored REGEXP for the requested century, while preserving the explicitly listed year equality alternatives. Keep range/multi-year entries unchanged; then execute the corrected UPDATE.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
