export const name='purchase-price';
export function apply(ctx) {
  ctx.on('benchmark/setup',async(payload,next)=>{
    await next();
    const {ac,audit,getRawBusinessResult}=payload;
    let overBudget=null,corrected=false;
    ac.on('tools/post-execute',async(call,result,next)=>{
      const decision=await next();
      if(decision.kind!=='accept')return decision;
      const raw=getRawBusinessResult(call.callId);
      if(!raw||raw.error)return decision;
      const page=String(raw.content).split('Available Actions:')[0];
      overBudget=null;
      if(!page.includes('[SEP] Buy Now'))return decision;
      const cap=page.match(/price lower than\s+([\d.]+)\s+dollars/i);
      const price=page.match(/\[SEP\]\s*Price:\s*\$([\d.]+)(?:\s+to\s+\$([\d.]+))?/i);
      if(cap&&price&&Number(price[1])>=Number(cap[1]))overBudget={price:price[1],cap:cap[1]};
      return decision;
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const result=await next();
      if(result.kind!=='allow'||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now'||!overBudget||corrected)return result;
      corrected=true;
      const reason=`The displayed price starts at $${overBudget.price}; the instruction requires a price lower than $${overBudget.cap}. This purchase exceeds the budget. Click '< prev' to compare other results, or 'back to search' to search another candidate. Keep all requested product features and select the required options before buying a product within budget.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
