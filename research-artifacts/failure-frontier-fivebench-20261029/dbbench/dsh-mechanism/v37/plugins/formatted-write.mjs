export const name='formatted-write';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const {ac,agent,audit,getRawBusinessResult}=p;
  let sampleSeen=false,warned=false;
  const task=()=>agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();
   if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const r=getRawBusinessResult(call.callId),text=String(r?.content||'').trim();
   if(r&&!r.error&&!/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text)&&/^\s*SELECT\b/i.test(a.query)&&! /\b(?:MAX|MIN|COUNT|SUM|AVG)\s*\(/i.test(a.query)&&text!=='[]'&&text)sampleSeen=true;
   return d;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();
   if(d.kind!=='allow'||call.name!=='execute_sql'||sampleSeen||warned)return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(!/^\s*(?:INSERT|UPDATE)\b/i.test(a.query))return d;
   const amounts=[...task().matchAll(/\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?)/g)].map(m=>m[1]);
   if(!amounts.some(v=>!a.query.includes(v)&&a.query.includes(v.replaceAll(',',''))))return d;
   warned=true;
   const reason='The requested amount has currency/ thousands formatting, but this write removes its separators before any actual data sample was inspected. SELECT the relevant monetary column and target rows first. Determine from observed values whether the field stores a formatted text amount or plain digits; preserve the actual convention and all explicit requested details, then execute the intended write once. SQL execution success alone does not verify the stored text format.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
