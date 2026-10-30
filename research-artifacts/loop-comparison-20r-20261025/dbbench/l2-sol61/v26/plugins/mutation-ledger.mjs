export const name='mutation-ledger';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getRawBusinessResult}=p;const completed=new Set(),blocked=new Set();
  const key=q=>q.trim().replace(/;\s*$/,'');
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql')return d;
   const q=key(call.arguments.query||'');if(completed.has(q)&&!blocked.has(q)){
    blocked.add(q);const reason='This exact mutation already executed successfully. Do not insert duplicates or apply the same update twice. Complete any remaining distinct change, or invoke commit_final_answer through the native tool API now.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }return d;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql'||!/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(call.arguments.query||''))return d;
   const raw=getRawBusinessResult(call.callId);if(!raw||raw.error||/^\d{4} \(/.test(String(raw.content)))return d;
   completed.add(key(call.arguments.query));
   const text='Execution ledger: this mutation executed without a SQL error. An empty [] is a normal mutation receipt, not an affected-row count. If all requested changes are now executed, invoke commit_final_answer using the native function tool. Otherwise execute the remaining distinct change. Do not replay the completed mutation.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text,text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};
  });
 });
}
