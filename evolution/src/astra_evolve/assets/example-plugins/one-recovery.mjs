// Installation example only, not a trained ALFWorld strategy.
export const name='one-recovery';
export function apply(ctx){
  ctx.on('benchmark/setup',async({ac,audit},next)=>{
    await next();
    let reviewed=false;
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();
      if(decision.kind!=='allow'||call.name!=='act'||call.arguments.command!=='finish'||reviewed)return decision;
      reviewed=true;
      const reason='RECOVER: take -> clean -> put. One recovery opportunity before finishing.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
