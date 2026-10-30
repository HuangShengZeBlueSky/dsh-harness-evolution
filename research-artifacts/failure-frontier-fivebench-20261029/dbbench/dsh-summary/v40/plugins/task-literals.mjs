export const name='task-literals';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const type=Array.isArray(taskContext?.type)?taskContext.type[0]:taskContext?.type;if(String(type).toUpperCase()!=='UPDATE')return;
 const literals=String(taskContext?.description||'').split(String.fromCharCode(34)).filter((v,i)=>i%2===1&&v.length>0);
 const abbreviations=[...String(taskContext?.description||'').matchAll(/\(([A-Za-z]{1,8}\.)\)/g)].map(m=>m[1]);
 if(!literals.length&&!abbreviations.length)return;
 let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||''),quote=String.fromCharCode(39);
  const missing=abbreviations.find(a=>q.includes(quote+a.slice(0,-1)+quote)&&!q.includes(quote+a+quote));
  if(!missing)return decision;warned=true;const reason='The actual SQL argument omits punctuation from the abbreviation '+JSON.stringify(missing)+' explicitly supplied in the task. Preserve the complete abbreviation, including its final period, when used as a filter value. Correct the real execute_sql arguments, not only the SQL printed in prose. This attempt did not execute; this reminder is issued once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const result=await next();const text='Exact quoted text from this request: '+JSON.stringify(literals)+'. When these strings are used as database values, preserve their characters exactly. A supplied replacement string takes precedence over stylistic normalization or the old value format. Do not remove interior spaces or append unit symbols. Distinguish quoted field labels from values using the original request. If the existing value already equals the requested value, follow any instruction to leave correct records unchanged.'+(abbreviations.length?' Parenthetical abbreviations from this request: '+JSON.stringify(abbreviations)+'. Preserve their final period in the actual SQL arguments.':'');
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...result,sections:[...result.sections,{name,order:29,text,interpolate:false}]};
 });
});}
