export const name='sql-recovery';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getRawBusinessResult}=p;let failure='',query='';
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(call.name==='execute_sql'){
    const raw=getRawBusinessResult(call.callId);const text=String(raw?.content??'');
    failure=raw?.error||/^\d{4} \(/.test(text)?text:'';query=call.arguments.query||'';
   }return d;
  });
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!failure)return r;
   const text='SQL recovery state. Failed SQL: '+query+'\nActual database error: '+failure+'\nThis is MySQL. Correct the failed SQL before retrying: backtick the exact table and column names, including reserved names such as `Rank`. Double quotes are not identifier quotes here. For unknown columns, copy the exact public header or DESCRIBE result, preserving non-breaking spaces and punctuation. A literal \\xa0 in a Python row means the Unicode non-breaking space, not six literal characters. Do not blame the database or claim success. Use execute_sql to make a materially corrected query.';
   audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};
  });
 });
}
