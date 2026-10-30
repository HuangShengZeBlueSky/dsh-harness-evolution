export const name='max-result';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const question=String(p.taskContext?.description||'');if(!/\b(next|unique|highest)\b/i.test(question)||/\b(forbid|without|do not use|no numeric)\b/i.test(question))return;let warned=false;
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||warned||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query||''),raw=p.getRawBusinessResult(call.callId);if(!/^\s*SELECT\b/i.test(q)||!raw||raw.error||/^\s*\d{4}\s*\(/.test(String(raw.content)))return d;
  const m=q.match(/MAX\s*\(\s*(`[^`]+`|[A-Za-z_][A-Za-z0-9_. ]*)\s*\)/i);if(!m||!/^(rank|no\.?|episode(?: #)?|game|match(?: no\.?)?|pick(?: #)?)$/i.test(m[1].replaceAll('`','').trim()))return d;warned=true;
  const col='`'+m[1].replaceAll('`','').trim()+'`',suggestion=q.replace(m[0],'MAX(CAST('+col+' AS UNSIGNED))');
  const text='MAX source interpretation: the SQL above succeeded, but MAX of this TEXT identifier is lexicographic, not the greatest number. A returned 9 or summary label is not a numeric upper bound. Recompute a numeric maximum in the same scope before choosing new identifiers; for example: '+suggestion+' . Ignore nonnumeric summary labels and preserve existing identifier string patterns. For several new records allocate distinct unused identifiers, not the same next value for every row. This explanation occurs once.';
  p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};
 });
});}
