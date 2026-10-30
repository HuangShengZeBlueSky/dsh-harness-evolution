export const name='query-rebuild';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=p;
 let pending='',diagnosed=false,noted=false,warned=false;
 const guidance=()=> 'Query rebuild: the original requested query is still unresolved: '+pending+'. A later DISTINCT/MAX diagnostic only shows stored categories or representations, not the requested answer. Use the observed exact category/text to rebuild and EXECUTE the original projection or aggregate. A textual value such as a threshold label can be matched with equality to retrieve its associated field; a category abbreviation requires rerunning the aggregate with that actual value. NULL/no matching rows is not a measured zero. Preserve the original requested output fields and conditions.';
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const raw=getRawBusinessResult(call.callId),text=String(raw?.content||'').trim();
  if(!raw||raw.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text))return d;
  if(/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(a.query)){pending='';diagnosed=false;return d;}
  if(!/^\s*SELECT\b/i.test(a.query))return d;
  const empty=text==='[]'||/^\[\(None,?\)\]$/.test(text);
  const diagnostic=/^\s*SELECT\s+(?:DISTINCT\b|MAX\s*\()/i.test(a.query);
  if(empty){if(/\bWHERE\b/i.test(a.query)&&!diagnostic){pending=a.query;diagnosed=false;}return d;}
  if(!pending)return d;
  if(!diagnostic){pending='';diagnosed=false;return d;}
  diagnosed=true;if(noted)return d;noted=true;
  const annotation=guidance();audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
  return {...d,content:[...(d.content||result.content),{type:'text',text:'\n'+annotation}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||!pending||!diagnosed||warned)return d;
  warned=true;const reason=guidance();audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
