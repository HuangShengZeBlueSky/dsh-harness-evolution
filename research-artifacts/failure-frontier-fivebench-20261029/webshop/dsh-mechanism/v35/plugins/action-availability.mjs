export const name='action-availability';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();let values=null;const denied=new Set();
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;
 const raw=getRawBusinessResult(call.callId);if(raw?.error||result.isError)return d;
 const t=typeof raw?.content==='string'?raw.content:(result.content||[]).map(x=>x.text||'').join('\n');
 const list=t.split('Available Actions:').at(-1).match(/['"]clickables['"]:\s*\[([\s\S]*)\]/)?.[1];
 values=list===undefined?null:[...list.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map(m=>(m[1]??m[2]).replace(/\\(.)/g,'$1'));return d;});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;
 const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
 if(call.name!=='click_action'||!values||values.includes(a?.value))return d;
 const key=JSON.stringify([values,a?.value]);if(denied.has(key))return d;denied.add(key);
 const reason='No option was selected: '+JSON.stringify(a?.value)+' is absent from this page. Available exact click values: '+JSON.stringify(values)+'. Use a complete listed value only if it satisfies the original request. If the required variant is absent, go back to search and inspect another product; do not buy on the assumption this failed click selected it.';
 audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};});
});}
