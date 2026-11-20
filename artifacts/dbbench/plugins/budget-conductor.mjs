export const name='budget-conductor';
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let sql=0,write=0,last='',errors=0;
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   sql++;let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}
   const q=args?.query||'',raw=p.getRawBusinessResult(call.callId)?.content||'';last=q;
   if(/^\d{4} \(/.test(raw))errors++;else if(/^(INSERT|UPDATE|DELETE)\b/i.test(q.trim()))write++;
   return d;
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();const step=p.getVisibleInput()?.step||1;
   const text=`Execution budget state: model call ${step} of the fixed 15 calls; ${sql} SQL calls, ${write} write statements executed without SQL error, ${errors} SQL errors. Every round must contain an actual tool call. ${step>=(config.threshold||11)?'Only a few calls remain. Execute the still-missing requested operation now; if the answer/result is already obtained, call commit_final_answer immediately. Do not merely promise to submit or keep repeating diagnostics.':'Use a short explanation followed by the next real tool call; avoid repeated plans.'} ${config.last&&last?'Latest SQL: '+last.slice(0,600):''}`;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:60,text,interpolate:false}]};
  });
 });
}
