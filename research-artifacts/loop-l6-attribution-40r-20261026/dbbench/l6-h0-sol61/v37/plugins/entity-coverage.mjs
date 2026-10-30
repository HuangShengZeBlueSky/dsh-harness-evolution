export const name='entity-coverage';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!/together|compared|how many more/i.test(String(p.taskContext?.description||'')))return;
 let seenRows=false,used=false,emptyWarned=false;
 const sql=call=>{const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;return String(a?.query||'');};
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const q=sql(call),raw=p.getRawBusinessResult(call.callId);if(!raw||raw.error||/^\d{4}\s*\(/.test(String(raw.content)))return d;
  if(/^\s*(INSERT|UPDATE|DELETE)\b/i.test(q))seenRows=false;
  if(/^\s*SELECT\b/i.test(q)&&!/\b(SUM|COUNT|AVG|MAX|MIN)\s*\(/i.test(q)&&String(raw.content).trim()!=='[]')seenRows=true;
  let text='';
  if(/^\s*SELECT\b/i.test(q)&&String(raw.content).trim()==='[]'&&!emptyWarned){emptyWarned=true;text='Empty entity selection: this proves only that the current predicate matched no rows. Before declaring requested entities absent, inspect DISTINCT values of the identifying column and relevant raw rows; names may include codes, qualifiers or different spelling. Then resolve each requested entity using actual database evidence.';}
  else if(/\bSUM\s*\(/i.test(q)&&String(raw.content).trim()!=='[]')text='The aggregate SQL executed and its actual result is above. If this completes the question, select the registered commit_final_answer tool to submit the result as answer strings. Printing a function name in prose does not submit.';
  if(!text)return d;
  p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};
 });
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||seenRows||call.name!=='execute_sql'||!/\bSUM\s*\(/i.test(sql(call)))return d;
  used=true;const reason='Entity coverage check: before combining multiple named entities, inspect their actual stored names and individual rows with SELECT (or DISTINCT on the identifying column). An aggregate can return a plausible nonempty number while one requested entity matches nothing. Resolve abbreviations against visible database values; confirm every requested entity, then calculate. This reminder occurs once and did not execute the attempted SQL.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
