export const name='result-fidelity';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let noted=false,denied=false,signed=[];
  const {ac,audit,getRawBusinessResult}=p;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();
   if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const r=getRawBusinessResult(call.callId),text=String(r?.content||'');
   signed=[];
   if(!r||r.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text)||!/^\s*SELECT\b/i.test(a.query))return d;
   signed=[...text.matchAll(/['"]([−–]\d+(?:\.\d+)?)['"]/g)].map(m=>m[1]);
   if(noted||!/[−–]/.test(text))return d;
   noted=true;
   const annotation='Result fidelity: the returned text contains meaningful Unicode minus/dash characters. Preserve returned text exactly; do not normalize − or – to ASCII -. If the question requests one value, do not arbitrarily take the first row: retain ALL original task conditions in the final SELECT, rather than replacing them with a name that may repeat. Inspect full matching rows if needed to disambiguate. If the task requests a list or grouped results, preserve every requested row and field instead of forcing one answer.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...d,content:[...(d.content||result.content),{type:'text',text:'\n'+annotation}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||denied||!signed.length)return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(!(a.answers||[]).some(v=>signed.some(s=>String(v)===s.replace(/^[−–]/,'-'))))return d;
   denied=true;const reason='Result fidelity: the actual latest SELECT returned Unicode signed text '+signed.join(', ')+'. Your final answer changes that character to ASCII -. Preserve the observed string exactly when submitting the requested value.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
