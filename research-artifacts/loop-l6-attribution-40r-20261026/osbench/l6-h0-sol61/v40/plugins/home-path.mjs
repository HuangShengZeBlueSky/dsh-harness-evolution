export const name='home-path';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit},next)=>{
 await next();const seen=new Set();
 ac.on('tools/pre-execute',async(call,next)=>{
  const result=await next();if(result.kind!=='allow'||call.name!=='bash_action')return result;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const script=args.script||'';
  if(seen.has(script)||!(/~\\+\//.test(script)||script.includes('/home/$(whoami)')))return result;
  seen.add(script);const reason='This home path expression is incorrect: escaping the slash after ~ prevents tilde expansion, and /home/$(whoami) is not necessarily the home directory. Use ~/directory with no backslash after ~, or "$HOME/directory". Correct the path and rerun your calculation.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
