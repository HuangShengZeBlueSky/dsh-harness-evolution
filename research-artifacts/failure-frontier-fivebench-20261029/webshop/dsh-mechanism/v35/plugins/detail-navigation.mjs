export const name = 'detail-navigation';
export function apply(ctx) {
 ctx.on('benchmark/setup', async ({ac,audit,getRawBusinessResult},next) => {
  await next();
  ac.on('tools/post-execute', async (call,result,next) => {
   const decision=await next(); if(decision.kind!=='accept') return decision;
   const c=getRawBusinessResult(call.callId)?.content ?? result.content;
   const text=typeof c==='string'?c:(c||[]).map(x=>x.text||'').join('\n');
   const actions=text.split('Available Actions:').at(-1);
   if(!actions.includes("'< prev'") || actions.includes("'buy now'") || actions.includes("'next >'") || /'b[a-z0-9]{9}'/i.test(actions)) return decision;
   const tokens=text.split('[SEP]').map(x=>x.trim());
   const instruction=tokens[tokens.findIndex(x=>x.endsWith('Instruction:'))+1]||'';
   const annotation='Page state: product details subpage. Purchase has NOT occurred and buy now is unavailable here. Original request: '+instruction+'\nUse the details you just read to check every requested property, ingredient and product type. Reading details is not confirmation: one matched ingredient does not establish another, and partial overlap is insufficient. If a required property is contradicted or still unsupported, use back to search and inspect a different candidate while retaining the complete request. If the product meets the request, click_action({"value":"< prev"}) to return, select genuinely required options, then buy now. Do not buy merely because you have finished reading; do not click buy now on this subpage.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
