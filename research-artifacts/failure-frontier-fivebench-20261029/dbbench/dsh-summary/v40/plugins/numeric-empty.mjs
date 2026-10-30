export const name='numeric-empty';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();let pending=false,warned=false,hadWrite=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||'').trim(),upper=q.toUpperCase(),raw=getRawBusinessResult(call.callId);
  if(!raw||raw.error||!String(raw.content).trimStart().startsWith('['))return decision;
  if(['INSERT','UPDATE','DELETE'].some(v=>upper.startsWith(v))){pending=false;hadWrite=true;return decision;}
  if(!upper.startsWith('SELECT'))return decision;
  const where=upper.includes('WHERE')?q.slice(upper.indexOf('WHERE')+5):'';
  pending=/[<>]=?\s*[+-]?\d/.test(where)&&['[]','[(None,)]','[(0,)]','[(0.0,)]'].includes(String(raw.content).trim());return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='commit_final_answer'||!pending||hadWrite||warned)return decision;
  warned=true;const reason='The numeric range query returned no rows, NULL or zero, but the stored number format has not been checked since that result. Inspect actual values in the compared column before concluding there is no match. TEXT values may contain grouping separators or other notation; choose any conversion only after observing the representation, and preserve original returned answer strings. A confirmed empty result remains valid: do not invent matching records. This submission did not execute; this numeric-format check is issued once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
