export const name="repetition-recovery";
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent,getRawBusinessResult}=p;
 const taskText=()=>agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>(e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text)).filter(t=>!t.startsWith('No tool call')).join('\n');
 const argsOf=call=>{try{return typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments||{};}catch{return {};}};
 const add=(r,text)=>{audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};};
 const deny=(call,reason)=>{audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};};
 
 let previous='',repeats=0,receipt='',blocked=false;
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(call.name!=='bash_action')return d;const s=argsOf(call).script||'';repeats=s===previous?repeats+1:1;previous=s;receipt=String(getRawBusinessResult(call.callId)?.content||'').slice(-250);return d;});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind==='allow'&&!blocked&&call.name==='bash_action'&&repeats>=2&&argsOf(call).script===previous){blocked=true;return deny(call,'This identical command has already run repeatedly. Its last real output was: '+receipt+' If it answers the task, call answer_action now. Otherwise inspect a raw sample or fix the failing stage; do not repeat the unchanged command.');}return d;});
 
});}
