export const name='budget-check';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=p;let over='',denied=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
  over='';const parts=raw.content.split('[SEP]').map(s=>s.trim()),price=parts.find(s=>/^Price:/.test(s));
  const limit=Number((parts[1]||'').match(/price\s+(?:lower|less)\s+than\s+([\d.]+)/i)?.[1]||Infinity);
  if(price&&!/\bto\b/.test(price)&&Number(price.match(/[\d.]+/)?.[0])>=limit)over='This fixed product price '+price+' does not meet the requested price below $'+limit+'. Click < prev and compare an affordable product of the requested type, or search again. Do not buy this over-budget product.';
  if(!over)return d;audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:over});return {...d,content:[...(d.content||result.content),{type:'text',text:over}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(call.name==='click_action'&&a.value.toLowerCase()==='buy now'&&over&&!denied){denied=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason:over});return {kind:'deny',reason:over};}return d;
 });
});}
