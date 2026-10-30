export const name='visit-memory';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit,getRawBusinessResult}=p;let results=false,pageIds=new Set(),current='';const seen=new Map(),left=new Set();
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const parts=raw.content.split('[SEP]').map(s=>s.trim()),pi=parts.findIndex(s=>/^Price:/.test(s));
 if(raw.content.includes('Page ')){if(current)left.add(current);current='';results=true;pageIds=new Set(parts.filter(s=>/^[A-Z0-9]{10}$/.test(s)).map(s=>s.toLowerCase()));const old=[...pageIds].filter(id=>left.has(id));if(!old.length)return d;
 const annotation='Previously opened and left without buying on this task: '+old.map(id=>id+' | '+seen.get(id)).join('; ')+'. Other visible candidates not yet inspected: '+[...pageIds].filter(id=>!seen.has(id)).join(', ')+'. Use your earlier findings when comparing; revisit an inspected item only for a specific unresolved check. Leaving a product does not prove it is unsuitable.';
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};}
 if(pi>=0){if(results&&call.name==='click_action'&&pageIds.has(a.value)){current=a.value;seen.set(current,parts[pi-1]);}results=false;return d;}
 if(call.name==='search_action'||a.value==='back to search'){if(current)left.add(current);current='';}results=false;return d;
 });
});}
