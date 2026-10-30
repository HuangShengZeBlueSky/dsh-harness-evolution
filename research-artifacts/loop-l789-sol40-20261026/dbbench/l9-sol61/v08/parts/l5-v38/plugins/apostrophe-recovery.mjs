export const name='apostrophe-recovery';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let used=false;
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql'||used)return d;const raw=p.getRawBusinessResult(call.callId);if(!raw||!/^\s*1064\s*\(/.test(raw.content))return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=a.query;
  const fixed=q.replace(/("(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`)|(?<=\p{L})'(?=\p{L})/gu,(m,quoted)=>quoted?m:"''");if(fixed===q)return d;used=true;
  const annotation='This actual syntax error is consistent with an unescaped apostrophe inside a word/name in a single-quoted SQL string. Use two SQL single quotes for that apostrophe; keep the intended character, public identifiers, filters and other values. Ready recovery arguments for execute_sql: '+JSON.stringify({query:fixed})+'. Make the real tool call, inspect the result, then commit after success. The failed SQL did not complete the operation; this suggestion has not executed it.';
  p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
