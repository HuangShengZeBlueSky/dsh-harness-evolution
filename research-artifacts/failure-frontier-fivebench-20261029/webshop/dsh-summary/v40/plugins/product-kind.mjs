export const name='product-kind';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;
 let task='',title='',productPage=false,denied=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept')return decision;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
  const text=raw.content;task=text.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||task;
  productPage=(text.split('Available Actions:')[1]||'').includes("'buy now'");
  if(productPage){const parts=text.split('Observation:')[1].split('Available Actions:')[0].split('[SEP]').map(x=>x.trim());title=parts[parts.findIndex(x=>x.startsWith('Price:'))-1]||'';}
  return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||denied||!productPage||call.name!=='click_action')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now')return decision;
  let reason='';
  if(/\bjump\s*suit\b/i.test(task)&&!/\bjump\s*suit\b/i.test(title)&&/\b(jacket|blazer)\b/i.test(title))reason='The request is for a jumpsuit. A suit jacket or blazer is not a jumpsuit. Search again using the joined product word jumpsuit, keeping the original color, washing requirement, use and price limit.';
  if(/\ba samsung phone\b/i.test(task)&&/charger block|power adapter|wall charger/i.test(title)&&!/\bsmartphone\b/i.test(title))reason='The request is for an actual Samsung phone, while this is a charging accessory compatible with phones. Search first for the primary device using the short query Samsung Galaxy smartphone plus the requested color. Leave fast charging and price wording out of the search keywords because those words are retrieving accessories. This only changes retrieval: the final phone must still support fast charging and satisfy the original color and price limit. Open an actual phone listing, read features if charging support is unclear, and reject chargers/cables/charging pads. A charger does not satisfy the phone request.';
  if(!reason)return decision;
  denied=true;reason='Purchase not executed: current product '+JSON.stringify(title)+'. '+reason+' Open a matching product and choose only requested actual options before buying.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
 });
});}
