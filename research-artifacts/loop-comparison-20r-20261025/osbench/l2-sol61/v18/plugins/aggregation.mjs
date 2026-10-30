export const name='aggregation';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next(); const {ac,audit,getVisibleInput,agent}=p;
  const isUnique=()=>/unique|distinct/i.test(JSON.stringify(getVisibleInput().messages)+' '+agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>JSON.stringify(e.data)).join(' '));
  let calls=0,warning='';
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next(); if(!isUnique())return r;
   const text='For unique/distinct counts across files, deduplicate only the requested value, never the filename or entire record. grep on multiple files prefixes filenames: use grep -h (and -o when extracting values) before sort -u. Normalize case only if requested. '+warning;
   audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};
  });
  let corrected=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||!isUnique()||corrected)return d;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const s=args.script||'';
   if(/\bgrep\b/.test(s)&&/sort|uniq/.test(s)&&/\*|xargs/.test(s)&&!(/grep\s+-[^\s]*h|grep\s+--no-filename/.test(s))){
    corrected=true;const reason='Cross-file uniqueness would include grep filename prefixes. Add -h to grep, keep the extraction pattern and file selection, then rerun the aggregation.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }return d;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next(); if(d.kind!=='accept'||!isUnique()||call.name!=='bash_action')return d;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   calls++;const s=args.script||'';
   if(/\bgrep\b/.test(s)&&/sort|uniq/.test(s)&&!(/grep\s+-[^\s]*h|grep\s+--no-filename/.test(s))){
    warning='Last aggregation used grep without -h. If it read multiple files, rerun with filename prefixes suppressed before trusting the count.';
    audit({method_id:name,hook:'tools/post-execute',annotation:warning});
    return {...d,content:[...(d.content||result.content),{type:'text',text:warning}]};
   }
   warning=''; return d;
  });
 });
}
