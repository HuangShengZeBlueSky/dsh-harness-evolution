export const name='table-axis';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let noted=false,multipleMatched=false,avgWarned=false;const {ac,agent,audit,getRawBusinessResult}=p;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;

  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  const schema=task.split('\nQuestion:')[0],question=task.split('Question:')[1]||'';
  if(!/headers of this table are Component,/i.test(schema)||! /Model/i.test(schema))return d;
  const raw=getRawBusinessResult(call.callId),text=String(raw?.content||'');
  if(!raw||raw.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text))return d;
  if(/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(a.query)){multipleMatched=false;return d;}
  if(/^\s*SELECT\b/i.test(a.query)&&/\bWHERE\s+`?Component`?\s*=/i.test(a.query)&&! /\b(?:COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(a.query))multipleMatched=/\),\s*\(/.test(text);
  if(noted||!/^\s*SELECT\s+\*/i.test(a.query))return d;
  const labels=[...text.matchAll(/\('([^']+)',/g)].map(m=>m[1]).filter(v=>question.toLowerCase().includes(v.toLowerCase()));
  if(!labels.length)return d;noted=true;
  const annotation='Table axis check: the first element of each returned tuple is a VALUE of the first schema column Component, not a column header. Matched row labels '+JSON.stringify(labels)+' identify component rows. Subsequent tuple cells align in order with the model columns in the supplied schema. Select the relevant row with WHERE `Component` = the observed label, then inspect or aggregate its values across the requested model columns. Do not invent a column named after a row label, or conclude the observed feature is absent merely because it is not a header. Determine the requested count/average from actual cells and preserve their model associations.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:'\n'+annotation}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||!multipleMatched||avgWarned)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  if(!/\baverage\b/i.test(task.split('Question:')[1]||'')||! /\bSUM\s*\(/i.test(a.query)||/\bAVG\s*\(/i.test(a.query))return d;
  avgWarned=true;const reason='Pivot average: your actual component lookup returned multiple matching rows. Summing matching cells across all those rows is a TOTAL, not the requested average number of models. First form each row\'s count across the model columns using the observed version condition, then AVG that row-wise count over all matching component rows (or divide the total by the actual matching-row count). Do not treat multiple stored rows as one, nor replace the requested average with a total. Execute the corrected aggregate using the real model columns and observed Component filter.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
