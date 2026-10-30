export const name='click-format';
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/(\d)\s*(?:x|by)\s*(\d)/g,'$1 x $2').trim();
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit,getRawBusinessResult}=p;
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
 const parts=raw.content.split('[SEP]').map(s=>s.trim()),pi=parts.findIndex(s=>/^Price:/.test(s)),start=parts.findIndex(s=>/^(size|color|style|pattern|capacity)$/i.test(s));if(pi<0||start<0)return d;
 const nums=new Set((parts[1]||'').match(/\d+/g)||[]);const values=parts.slice(start+1,pi-1).filter(v=>v.includes('"')&&(' '+norm(parts[1]||'')+' ').includes(' '+norm(v)+' ')).map(v=>({v,score:[...new Set(v.match(/\d+/g)||[])].filter(x=>nums.has(x)).length})).sort((a,b)=>b.score-a.score).slice(0,3);if(!values.length)return d;
 const annotation='Use a real click_action tool call. Quotation marks inside the option value must be escaped in JSON. Valid argument examples for visible options (choose the matching option):\n'+values.map(x=>JSON.stringify({value:x.v})).join('\n');
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
