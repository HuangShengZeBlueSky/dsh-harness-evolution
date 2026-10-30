export const name='row-commit-contract';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
 await next();const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
 if(types.some(x=>['INSERT','UPDATE','DELETE'].includes(x))||!/\b(?:each|both|list|show|display|retrieve)\b/i.test(String(taskContext?.description??'')))return;
 let rows=[],reminded=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query??''),projection=q.match(/^\s*SELECT\s+(.*?)\s+FROM\b/is)?.[1];
  if(!projection||projection.includes('*'))return d;
  let depth=0,quote='',multiple=false;
  for(const c of projection){if(quote){if(c===quote)quote='';continue;}if(c==='`'||c==='\''||c==='"')quote=c;else if(c==='(')depth++;else if(c===')')depth--;else if(c===','&&depth===0)multiple=true;}
  if(!multiple){rows=[];return d;}
  const raw=String(getRawBusinessResult(call.callId)?.content??'').trim();if(!raw.startsWith('[(')||raw.includes('[TRUNCATED]')){rows=[];return d;}
  rows=[];let start=-1,escape=false;depth=0;quote='';
  for(let i=1;i<raw.length-1;i++){const c=raw[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='\''||c==='"'){quote=c;continue;}if(c==='('){if(depth++===0)start=i;}else if(c===')'&&--depth===0)rows.push(raw.slice(start,i+1));}
  return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||!rows.length||reminded)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(Array.isArray(a?.answers)&&a.answers.length===rows.length&&a.answers.every((s,i)=>String(s).trim()===rows[i]))return d;reminded=true;
  const reason='Requested multi-column result contract: the observed query returned complete rows for a listing request, but the proposed answer does not preserve that row structure. Do not drop fields, flatten columns into separate answer items or deduplicate rows. If this query selects the fields requested by the task, submit one tuple string per row: '+JSON.stringify(rows)+'. If the projection includes unrequested helper fields, correct the SELECT first. No new database work or answer facts are implied by this formatting check.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
