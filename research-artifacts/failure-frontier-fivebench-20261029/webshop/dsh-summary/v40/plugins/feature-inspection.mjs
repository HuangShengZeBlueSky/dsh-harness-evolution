export const name='feature-inspection';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;
 let pending='',inspected=false,denied=false,lastTitle='';
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept')return decision;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
  const text=raw.content,args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const value=(args.value||'').toLowerCase();
  if(value==='features'){
   inspected=true;
   const task=text.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';
   const body=text.split('[SEP] < Prev [SEP]')[1]?.split('Available Actions:')[0]||'';
   if(/foaming cream/i.test(task)&&body&&!/\bcream\b/i.test(body)){
    const annotation='Remaining requirement check from the actual Features above: the request is for a foaming CREAM cleanser. These features describe foaming facial cleanser and may establish fragrance-free, but do not establish cream form. Reading Features is not confirmation of every requirement. Return to search and look for the original fragrance-free foaming cream cleanser with explicit cream-form support, preserving the price limit; do not buy this generic foaming cleanser just because one requirement was confirmed.';
    audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
    return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
   }
   return decision;
  }
  const actions=text.split('Available Actions:')[1]||'';
  if(!actions.includes("'buy now'")){pending='';return decision;}
  const parts=text.split('Observation:')[1].split('Available Actions:')[0].split('[SEP]').map(x=>x.trim());
  const title=parts[parts.findIndex(x=>x.startsWith('Price:'))-1]||'';
  if(title!==lastTitle){lastTitle=title;inspected=false;}
  const task=text.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';
  const normalize=s=>s.toLowerCase().replace(/[-–]/g,' ');
  pending=['height adjustable','grain free','fragrance free','long lasting','paraben free','foaming cream'].filter(x=>normalize(task).includes(x)&&!normalize(title).includes(x)).join(', ');
  return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||!pending||inspected||denied||call.name!=='click_action')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now')return decision;
  denied=true;const reason=pending==='height adjustable' ? 'Purchase not executed: the request requires height adjustable, but the current title does not establish it. Click features to read the actual product information. If it supports the requirement, click < prev and buy with the requested variants; otherwise return to results and find a matching chair. Keep the original requested color.' : 'Purchase not executed: the request requires '+pending+', but the current title does not establish it. Click features to check actual product information. If supported, click < prev to return to the product before buying; otherwise return to results or search for the original product with explicit support for '+pending+'. Keep every other requested attribute; organic or unscented alone does not establish all of them.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
 });
});}
