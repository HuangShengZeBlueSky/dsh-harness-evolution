export const name='single-result-fidelity';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
 await next();const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());if(types.some(t=>['INSERT','UPDATE','DELETE'].includes(t)))return;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query??'');
  const projection=q.match(/^\s*SELECT\s+(.*?)\s+FROM\b/is)?.[1],raw=String(getRawBusinessResult(call.callId)?.content??'').trim();
  if(!projection||projection.includes('*')||projection.includes(',')||!raw.startsWith('[(')||raw.includes('[TRUNCATED]'))return d;
  const annotation='Single-column result fidelity: submit the selected cell values in the exact returned row order, including repeated values. Do not sort or deduplicate them unless the question requires it. Preserve spelling, punctuation and Unicode whitespace inside each value. In Python-style output, \\xa0 represents an actual nonbreaking space, not an ordinary space or the literal characters backslash-x-a-zero. Do not substitute descriptions or inferred labels for returned cells.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
