// 详情导航：识别Features和Description子页，明确返回商品页后才能购买，衔接证据与购买闭环
export const name='details-return';
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;let inDetails=false;
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=p.getRawBusinessResult(call.callId)?.content||'';const action=call.arguments?.value;
 if(call.name==='search_action'||raw.includes('Total results:')||raw.includes('Price:'))inDetails=false;
 else if(['features','description','reviews'].includes(action))inDetails=true;
 const actions=raw.split('Available Actions:').pop()||'';
 if(!inDetails||actions.includes("'buy now'")||!actions.includes("'< prev'"))return d;
 const text='Details navigation: you are viewing an information subpage. The available next step to continue this purchase is click_action({"value":"< prev"}). This returns to the SAME product page. Then finish any requested option selections and click buy now. Do not search again merely to leave this subpage.';
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};
 });});}
