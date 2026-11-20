export const name='sql-recovery';
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let last='',errors=[],empty=false;const repeats=new Map();let emptyDenied=false;
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}
   const q=args?.query||'',raw=p.getRawBusinessResult(call.callId)?.content||'';let annotation='';
   if(/^\d{4} \(/.test(raw)){
    last=q;errors.push(raw.slice(0,300));repeats.set(q,(repeats.get(q)||0)+1);
    annotation=/^1064/.test(raw)?'MySQL syntax error: keep the exact table name and quote every identifier with backticks. In particular quote Rank inside CAST/MAX/ORDER BY. Do not alter valid data values or assume the environment is broken.':/^1054/.test(raw)?'Unknown column: map the requested concept to an exact supplied header. Do not drop a required field; correct the header and rerun.':/^1146/.test(raw)?'Table not found: use the original table name with spaces/punctuation inside backticks. Do not invent underscores or a database name.':'SQL error: repair this statement before claiming success.';
   }else if(/^SELECT\b/i.test(q.trim())&&raw==='[]'){
    empty=true;annotation='This SELECT matched no rows. Before concluding no answer, inspect a small sample or DISTINCT predicate values: exact Unicode dash, case, whitespace, and which column contains the concept can differ. An empty lookup is not proof the task is impossible.';
   }else empty=false;
   if(!annotation)return d;p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  if(config.memory)p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();const text='Recovery memory: '+(errors.length?errors.slice(-2).join(' | '):'No SQL errors observed.')+(empty?' Last lookup was empty: inspect literal values and relax one predicate for diagnosis.':'')+(last?' Do not repeat the same failed SQL unchanged: '+last.slice(0,500):'');p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:45,text,interpolate:false}]};
  });
  if(config.emptyGuard)p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||!empty||emptyDenied)return d;emptyDenied=true;const reason='Your last SELECT returned no rows. Before concluding no answer, inspect the actual predicate column values or a few rows and correct Unicode dashes/spacing or column mapping. Then submit the evidence-grounded result.';p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
  if(config.guard)p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql')return d;
   let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}
   const q=args?.query||'';if(repeats.get(q)===2){repeats.set(q,3);const reason='This exact SQL has already failed twice. Change the actual invalid identifier/syntax using the supplied schema, or inspect with DESCRIBE. Do not repeat unchanged.';p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return d;
  });
 });
}
