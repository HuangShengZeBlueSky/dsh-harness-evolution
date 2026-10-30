// 价格核对：维护当前商品价格与任务上限，超预算购买拦截一次并引导返回结果页
export const name='budget-check';
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;let price=null,limit=null,id='',blocked=new Set();
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=p.getRawBusinessResult(call.callId)?.content||'';
 const upper=raw.match(/price lower than\s*([\d.]+)/i);if(upper)limit=Number(upper[1]);
 const match=raw.match(/Price:\s*\$([\d.]+)/i);
 if(!match){if(raw.includes('Total results:')||call.name==='search_action')price=null;return d;}
 if(limit===null)return d;
 price=Number(match[1]);if(call.name==='click_action'&&/^[a-z0-9]{10}$/i.test(call.arguments.value))id=call.arguments.value;
 const text=`Budget check: current item $${price}; required price below $${limit}. `+(price>=limit?'OVER BUDGET. Click < prev and choose a cheaper matching product.':'Within budget. Still verify product features and requested options before buy now.');
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;if(call.name==='click_action'&&call.arguments.value==='buy now'&&price!==null&&limit!==null&&price>=limit&&!blocked.has(id)){blocked.add(id);const reason=`This item costs $${price}, above the required $${limit} limit. Click < prev, compare other items and buy an affordable match.`;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return d;});
 });}
