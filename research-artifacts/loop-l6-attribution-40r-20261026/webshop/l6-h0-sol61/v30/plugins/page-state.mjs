export const name='page-state';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit,getRawBusinessResult}=p;let detail=false,denials=0;
 const guidance='This is a product detail subpage. Only back to search and < prev are available. Click < prev to return to the same product page before selecting options, opening another detail section, or buy now. Your prior successful option selections remain recorded.';
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
 detail=/'clickables': \['back to search', '< prev'\]/.test(raw.content);if(!detail)return d;
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:guidance});return {...d,content:[...(d.content||result.content),{type:'text',text:guidance}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
 if(detail&&call.name==='click_action'&&!['back to search','< prev'].includes(a.value.toLowerCase())&&denials<2){denials++;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason:guidance});return {kind:'deny',reason:guidance};}return d;
 });
});}
