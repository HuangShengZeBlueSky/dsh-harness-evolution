export const name='format-evidence';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
 await next();const type=Array.isArray(taskContext?.type)?taskContext.type[0]:taskContext?.type;
 const description=String(taskContext?.description||'');
 if(String(type).toUpperCase()!=='INSERT')return;
 const formatRequired=/existing/i.test(description)&&/format|pattern/i.test(description);
 let sampleSeen=false,asked=false;
 const query=call=>{const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;return String(args?.query||'').trim();};
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const q=query(call),raw=getRawBusinessResult(call.callId);
  if(raw&&!raw.error&&/^SELECT\b/i.test(q)&&! /\b(MAX|MIN|COUNT|SUM|AVG)\s*\(/i.test(q)&&String(raw.content).startsWith('[('))sampleSeen=true;
  return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||sampleSeen||asked||!/^INSERT\b/i.test(query(call)))return decision;
  if(!formatRequired&&!/\bNULL\b/i.test(query(call)))return decision;
  asked=true;const reason=!formatRequired?'The proposed INSERT uses SQL NULL without inspecting existing missing-value conventions. First SELECT a few relevant existing rows. Distinguish SQL NULL from an empty string or textual marker, and include role information explicitly supplied in the task. Preserve legitimate NULL when the task or observed format supports it; do not invent missing facts. This INSERT did not execute and this reminder is issued only once.':'The task requires matching existing data formats, but no existing data rows have been read. First SELECT a few relevant rows to inspect the conventions for compound values, categories and missing-value markers. Preserve every explicitly supplied detail; do not replace a string marker with NULL or discard parenthetical information. Then perform the INSERT. This attempt did not execute; this format reminder is issued only once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
