export const name='write-receipts';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const done=new Map(),denied=new Set();
  const query=call=>{const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;return String(a?.query||'').trim().replace(/;\s*$/,'');};
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   const q=query(call),raw=p.getRawBusinessResult(call.callId);
   if(!/^(INSERT|UPDATE|DELETE)\b/i.test(q)||!raw||raw.error||/^\s*\d{4}\s*\(/.test(String(raw.content)))return d;
   done.set(q,call.callId);
   const text='Write receipt: this SQL executed without an SQL error. An empty result does not report an affected-row count. Preserve this write. Once all operations are complete, select the registered commit_final_answer tool to submit; do not print a function call in prose.';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,text});
   return {...d,content:[...(d.content||result.content),{type:'text',text}]};
  });
  p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql')return d;
   const q=query(call);if(!/^INSERT\b/i.test(q)||!done.has(q)||denied.has(q))return d;
   const users=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message');
   const last=users.at(-1)?.data?.content||[];
   if(!last.some(b=>b.type==='text'&&b.text.includes('No executable tool calls found')))return d;
   denied.add(q);
   const reason='This exact INSERT already executed successfully (call '+done.get(q)+'). The no-tool reminder concerns your submission response, not this database write. Select the registered commit_final_answer tool, or SELECT to inspect; repeating this INSERT adds duplicates. This recovery refusal is limited to once for this SQL.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
