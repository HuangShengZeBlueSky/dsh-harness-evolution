export const name='finalization-contract';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
  await next();
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
  const mutation=types.some(x=>/INSERT|UPDATE|DELETE/.test(x));
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();const text='Final submission API: invoke the actual commit_final_answer tool with a JSON OBJECT containing the answers ARRAY, for example {"answers": ["actual result"]}. A bare array is an invalid argument shape. For a completed database modification, use {"answers": []}. Assistant prose does not invoke the tool.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:40,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer')return d;
   let args=call.arguments;if(typeof args==='string'){try{args=JSON.parse(args);}catch{args=null;}}
   if(args&&typeof args==='object'&&!Array.isArray(args)&&Array.isArray(args.answers))return d;
   const reason='Invalid commit_final_answer argument shape. The tool requires an object with an answers array, not a bare array or string. Invoke commit_final_answer with '+(mutation?'{"answers": []} after executing all requested mutations.':'{"answers": ["the actual queried value"]} using the real query results.')+' Do not resend the same malformed arguments; this denied call has not submitted an answer.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
