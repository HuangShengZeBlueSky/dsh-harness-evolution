export const name='sql-contract';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getRawBusinessResult}=p;
  const isWrite=[p.taskContext?.type].flat().some(t=>/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(String(t)));
  const writes=new Set();let successful=0,asked=false,lastRead='',answerRepair=false;
  const key=q=>q.trim().replace(/;$/,'');
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow')return d;let reason;
   if(call.name==='commit_final_answer'&&Array.isArray(call.arguments))reason='Final submission arguments must be a JSON object, not an array. Call commit_final_answer with arguments '+JSON.stringify({answers:call.arguments})+'. Do not execute a completed write again.';
   else if(call.name==='execute_sql'&&/^\s*INSERT\b/i.test(call.arguments.query)&&writes.has(key(call.arguments.query)))reason='This exact INSERT already executed successfully. Repeating it creates duplicate rows. Finish through the actual commit_final_answer function once all requested rows are inserted.';
   else if(call.name==='commit_final_answer'&&!isWrite&&successful&&lastRead&&!answerRepair&&call.arguments.answers?.length===1&&/^(Done|Completed|Success)$/i.test(call.arguments.answers[0])&&!lastRead.toLowerCase().includes(call.arguments.answers[0].toLowerCase())){
    answerRepair=true;reason='This is a data query, not a write confirmation. Submit the actual requested value(s) from the SQL result, rather than an operation acknowledgement. If the last query needs correction, execute the corrected query first.';
   }else if(call.name==='commit_final_answer'&&!successful&&!asked){asked=true;reason='No successful SQL has been executed. Inspect the visible task table with execute_sql first; do not conclude that information is unavailable without reading rows. Then answer or perform the requested modification.';}
   if(!reason)return d;
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   const raw=getRawBusinessResult(call.callId);if(!raw||raw.error||result.isError||/^\d{4}\s*\(/.test(raw.content))return d;
   successful++;if(/^\s*SELECT\b/i.test(call.arguments.query))lastRead=raw.content;
   if(!/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(call.arguments.query))return d;
   writes.add(key(call.arguments.query));
   const annotation='\n\nWrite receipt: the SQL succeeded. [] is normal, not a request to retry. Keep all completed writes. Once the requested changes are complete, call the commit_final_answer function with a JSON OBJECT: {"answers":["Done"]}. Never pass a bare array as the function arguments.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   const text=isWrite?'Write-task contract: perform every requested change, then call commit_final_answer with OBJECT arguments {"answers":["Done"]}. Do not pass a bare array. Successful statements already recorded: '+JSON.stringify([...writes])+'. Never repeat successful INSERT statements.':'Query-task contract: collect SQL evidence and submit the actual requested data values using the commit_final_answer function. Its arguments are an object with an answers array. Preserve returned values and order; do not substitute an operation-success acknowledgement for a data answer.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:50,text,interpolate:false}]};
  });
 });
}
