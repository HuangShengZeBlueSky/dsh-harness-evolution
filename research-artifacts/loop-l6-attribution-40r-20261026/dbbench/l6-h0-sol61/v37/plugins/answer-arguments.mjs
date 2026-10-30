export const name='answer-arguments';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let used=false;p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||call.name!=='commit_final_answer')return d;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(!Array.isArray(args))return d;used=true;
  const reason='Submission argument correction: commit_final_answer requires an OBJECT whose answers property is an array of strings. You supplied the array as the entire arguments value. Keep your answer values unchanged and put that array under the answers key in an object. Use the native tool call, not prose. This correction is limited to once.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
