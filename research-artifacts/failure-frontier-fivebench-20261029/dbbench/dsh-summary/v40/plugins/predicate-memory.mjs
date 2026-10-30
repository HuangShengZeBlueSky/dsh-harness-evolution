export const name='predicate-memory';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();let origin=null;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||'').trimStart(),upper=q.toUpperCase(),raw=getRawBusinessResult(call.callId);
  if(!raw||raw.error||!String(raw.content).trimStart().startsWith('['))return decision;
  if(['INSERT','UPDATE','DELETE'].some(v=>upper.startsWith(v))){origin=null;return decision;}
  if(!upper.startsWith('SELECT')||!upper.includes('WHERE'))return decision;
  const where=q.slice(upper.indexOf('WHERE')+5),fields=[...new Set(where.split('`').filter((v,i)=>i%2===1))];
  if(!origin){const compact=upper.split(' ').join('');if(fields.length>=2&&String(raw.content).startsWith('[(')&&!String(raw.content).includes('None')&&!['COUNT(','SUM(','MAX(','MIN(','AVG('].some(v=>compact.includes(v)))origin={query:q,fields};return decision;}
  const missing=origin.fields.filter(f=>!where.toLowerCase().includes(('`'+f+'`').toLowerCase()));if(!missing.length)return decision;
  const annotation='Observed prior lookup used these filters: '+origin.query+' Current WHERE omits prior filter columns '+JSON.stringify(missing)+'. A retrieved name or label may identify multiple rows. When projecting the requested answer, preserve all original conditions or verify the key is unique; do not select an arbitrary first value from conflicting results. Broader queries may be useful for inspection, but do not substitute them for the original match. Preserve returned value characters.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
});}
