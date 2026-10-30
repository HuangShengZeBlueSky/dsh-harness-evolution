export const name='format-evidence';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,agent,audit,getRawBusinessResult}=p;const seen=new Set();let denials=0;
 const facts=()=>{
  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  const question=task.split('Question:')[1]||'',schema=task.split('\nQuestion:')[0];
  const headers=(schema.match(/headers of this table are ([\s\S]*)\.$/)?.[1]||'').split(',').map(s=>s.trim());
  const required=[...question.matchAll(/`([^`]+)`/g)].map(m=>m[1]).filter(v=>headers.includes(v));
  return {question,headers,required:required.length?required:headers.filter(Boolean)};
 };
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const raw=getRawBusinessResult(call.callId),text=String(raw?.content||'').trim();
  if(!raw||raw.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text)||text==='[]'||!text||!/^\s*SELECT\b/i.test(a.query)||/\b(?:SUM|COUNT|MAX|MIN|AVG)\s*\(/i.test(a.query))return d;
  const projection=a.query.split(/\bFROM\b/i)[0];
  const {headers}=facts();for(const f of headers){if(/\*/.test(projection)||projection.includes('`'+f+'`')||projection.replace(/^\s*SELECT\s+(?:DISTINCT\s+)?/i,'').split(',').some(v=>v.trim()===f))seen.add(f);}
  return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||denials>=2)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(!/^\s*INSERT\b/i.test(a.query))return d;
  const {question,required}=facts();if(!/(?:following the format|consistent with the existing data format)/i.test(question))return d;
  const missing=required.filter(f=>!seen.has(f));if(!missing.length)return d;denials++;
  const reason='Field-specific format evidence: the task explicitly requires the existing format, but these named fields have not been observed in actual data: '+JSON.stringify(missing)+'. SELECT representative existing values of those exact fields (and associated fields needed to interpret them) before INSERT. Inspect the actual punctuation, wording, decimal places and percent convention; then format the new values consistently. A sample of another field does not establish this convention. Map every explicitly named person/character to the corresponding data field rather than replacing that name with a generic label like Lead/Main Character; a role-status description belongs in its appropriate notes field. Compute requested values from the task, using samples only for representation.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
