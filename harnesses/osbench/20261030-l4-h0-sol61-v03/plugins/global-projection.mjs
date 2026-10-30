export const name="global-projection";
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent,getRawBusinessResult}=p;
 const taskText=()=>agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>(e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text)).filter(t=>!t.startsWith('No tool call')).join('\n');
 const argsOf=call=>{try{return typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments||{};}catch{return {};}};
 const add=(r,text)=>{audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};};
 const deny=(call,reason)=>{audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};};
 
let interventions=0;ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||interventions>=1)return d;const s=argsOf(call).script||'';const task=taskText();if(call.name==='bash_action' && /\bgrep\b/.test(s) && /sort\s+-u|\buniq\b/.test(s) && /\*|\bxargs\b/.test(s) && !/\bgrep\s+[^|;]*-[A-Za-z]*h/.test(s) && !/\bcat\b[^|]*\|\s*grep/.test(s)){interventions++;return deny(call,"Global uniqueness must compare extracted values, not filename:value pairs. grep over multiple files adds a filename prefix. Reissue with grep -h (for example grep -h -oE PATTERN FILES), then sort -u and count. Preserve the requested scope and pattern.");}return d;});
});}
