export const name='contains-scope';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const description=String(taskContext?.description||''),match=description.match(/`([^`]+)`\s+field\s+(?:already\s+)?contains\s+(?:the\s+)?(?:exact\s+)?phrase\s+"([^"]+)"/i);
 if(!match)return;const field=match[1],phrase=match[2];let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||'').trim(),upper=q.toUpperCase();if(!['SELECT','UPDATE'].some(v=>upper.startsWith(v))||!upper.includes('WHERE'))return decision;
  const parts=q.slice(upper.indexOf('WHERE')+5).split('`'),quote=String.fromCharCode(39);
  const wrong=parts.some((v,i)=>i%2===1&&v.toLowerCase()===field.toLowerCase()&&String(parts[i+1]||'').trimStart().startsWith('=')&&String(parts[i+1]||'').trimStart().slice(1).trimStart().startsWith(quote+phrase+quote));
  if(!wrong)return decision;warned=true;
  const reason='The request says '+JSON.stringify(field)+' CONTAINS the phrase '+JSON.stringify(phrase)+'. Whole-cell equality excludes records with other text around that phrase. Use a substring condition for that field and preserve the case-sensitive requirement if stated in the request, as well as every other filter. Keep the requested append or replacement semantics. Do not conclude there are no containing records from an equality-only query. This SQL did not execute; this scope correction is issued once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
