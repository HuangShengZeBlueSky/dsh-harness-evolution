export const name="task-contract";
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent,getRawBusinessResult}=p;
 const taskText=()=>agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>(e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text)).filter(t=>!t.startsWith('No tool call')).join('\n');
 const argsOf=call=>{try{return typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments||{};}catch{return {};}};
 const add=(r,text)=>{audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};};
 const deny=(call,reason)=>{audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};};
 ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();const task=taskText();if(!(true))return r;return add(r,"Before executing, identify the task contract: input scope, matching rule, value to extract, aggregation, required file changes, and final answer format. Dates and timestamps differ: a timestamp may include both date and time. A user ID or action may be separated by punctuation rather than whitespace. For unique values across files, extract ONLY that value and deduplicate globally. If the task asks for matching lines, do not count files. If it asks for occurrences, multiple occurrences on one line count separately. Complete every requested file modification before answer_action.");});
});}
