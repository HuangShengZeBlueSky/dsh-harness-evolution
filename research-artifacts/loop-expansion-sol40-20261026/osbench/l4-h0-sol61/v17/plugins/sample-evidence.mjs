export const name="sample-evidence";
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent,getRawBusinessResult}=p;
 const taskText=()=>agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>(e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text)).filter(t=>!t.startsWith('No tool call')).join('\n');
 const argsOf=call=>{try{return typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments||{};}catch{return {};}};
 const add=(r,text)=>{audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};};
 const deny=(call,reason)=>{audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};};
 let sampled=false;ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();const s=argsOf(call).script||'';const raw=getRawBusinessResult(call.callId);if(call.name==='bash_action'&&/\b(?:head|sed|cat)\b/.test(s)&&!/\b(?:wc|sort|uniq)\b/.test(s)&&raw&&!/No such file|command not found/.test(raw.content||''))sampled=true;return d;});
let interventions=0;ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||interventions>=1)return d;const s=argsOf(call).script||'';const task=taskText();if(call.name==='bash_action' && !sampled && /\b(?:wc|sort|uniq|awk)\b/.test(s) && !/\b(?:head|sed)\b/.test(s)){interventions++;return deny(call,"Before aggregating, inspect a few actual input lines using head -n 3 on a real requested file. Then use the observed fields and separators to compute the answer. Listing filenames alone does not establish the record format.");}return d;});
});}
