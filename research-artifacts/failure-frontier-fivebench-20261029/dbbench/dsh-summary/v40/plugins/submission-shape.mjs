export const name='submission-shape';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit},next)=>{
 await next();let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='commit_final_answer'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(!Array.isArray(args))return decision;
  warned=true;const reason='Invalid commit_final_answer argument shape: the tool requires a JSON object containing the answers field, whose value is your array of strings. The array itself cannot be the top-level arguments. Keep your answer entries and place the array under answers, then call the same function through the native interface. This attempt was not submitted; do not repeat the unchanged bare array.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
