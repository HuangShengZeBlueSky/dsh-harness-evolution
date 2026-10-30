export const name = 'empty-result-recovery';
export function apply(ctx){
  ctx.on('benchmark/setup',async(p,next)=>{
    await next();
    let emptyNoted=false;
    const {ac,audit,getRawBusinessResult}=p;
    ac.on('tools/post-execute',async(call,result,next)=>{
      const decision=await next();
      if(decision.kind!=='accept'||call.name!=='execute_sql'||emptyNoted)return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const raw=getRawBusinessResult(call.callId);
      if(!raw||raw.error||!/^\s*SELECT\b/i.test(args.query))return decision;
      const text=String(raw.content).trim();
      if(text!=='[]'&&!/^\[\(None,?\)\]$/.test(text))return decision;
      emptyNoted=true;
      const annotation='Empty-result recovery: this query matched no rows; that does not establish that the requested information is unavailable. Before submitting an absence or zero answer, inspect DISTINCT values or a small sample of the relevant columns. Verify the actual date format, category abbreviations, score formatting, spaces and punctuation. Relax an unverified filter to inspect nearby rows, then rebuild the condition from observed values. Preserve text exactly rather than replacing a formatted score with its numeric fragment. If the data still does not support an answer, report that honestly.';
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content||result.content),{type:'text',text:'\n'+annotation}]};
    });
  });
}
