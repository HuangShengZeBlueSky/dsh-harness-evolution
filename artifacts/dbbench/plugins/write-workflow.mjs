export const name='write-workflow';
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const kind=p.taskContext?.type?.[0]||'';let writes=[],lastRead='',checked=false,denied=false;const duplicateDenied=new Set();
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}
   const q=args?.query||'',raw=p.getRawBusinessResult(call.callId)?.content||'';
   if(/^(INSERT|UPDATE|DELETE)\b/i.test(q.trim())&&!/^\d{4} \(/.test(raw)&&!p.getRawBusinessResult(call.callId)?.error){writes.push(q);checked=false;}
   else if(/^SELECT\b/i.test(q.trim())){lastRead=q;if(writes.length)checked=true;}
   if(!config.receipt)return d;
   const annotation=/^\d{4} \(/.test(raw)?'SQL failed; no requested change has been established. Correct the error and continue.':/^(INSERT|UPDATE|DELETE)\b/i.test(q.trim())?'Statement executed without a SQL error. An empty [] is normal for DML, but does not prove the intended rows matched. Verify the requested values with a targeted SELECT, then make a real commit_final_answer function call. Never repeat a successful INSERT just because its result is empty; [] is normal for writes.':'';
   if(!annotation)return d;p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  if(config.dedupe)p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql')return d;let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}const q=args?.query||'';
   if(writes.includes(q)&&!duplicateDenied.has(q)){duplicateDenied.add(q);const reason='This exact mutation already executed without SQL error. Repeating it can insert duplicate rows or apply arithmetic twice. Verify its result with SELECT, then call commit_final_answer. If the task truly requires another identical operation, retry explicitly after checking.';p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return d;
  });
  if(config.proof)p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||denied||!['INSERT','UPDATE','DELETE'].includes(kind))return d;
   if(!writes.length||(config.requireCheck&&!checked)){denied=true;const reason=!writes.length?'The requested '+kind+' has not executed successfully. A SELECT or proposed SQL is not the requested database change. Execute the actual operation, repair any SQL errors, then submit.':'A write executed but its intended effects are still unverified. Run a targeted SELECT for the changed records, compare all requested values, then submit.';p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return d;
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();const text=`Operation workflow: task operation is ${kind}. If requested to add a row, actually INSERT it; computing the next identifier alone is unfinished. If asked UPDATE/DELETE, execute that operation with the complete target predicate. Read diagnostics are not a replacement for the requested write. SET a requested final value exactly; only add/subtract when the task explicitly asks for a relative change. For copying an existing record with changes use INSERT ... SELECT so unspecified values remain exact. Preserve all unaffected rows/columns. ${config.verify?'After writing use a targeted SELECT to verify actual affected records; a valid UPDATE can match zero rows. For append/include tasks retain existing text with CONCAT rather than replacing it. ':''}Successful write statements so far: ${writes.length}. ${writes.length?'Do not repeat an already successful INSERT just to get a result.':''}`;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:40,text,interpolate:false}]};
  });
 });
}
