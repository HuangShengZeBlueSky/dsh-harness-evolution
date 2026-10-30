export const name='entity-lookup';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
const canonical=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64);
const quote=s=>'`'+canonical(s).replace(/`/g,'``')+'`';
function wherePart(sql){
 let quoted=null;
 for(let i=0;i<sql.length;i++){
  const c=sql[i];if(quoted){if(c==='\\'){i++;continue;}if(c===quoted){if(sql[i+1]===c)i++;else quoted=null;}continue;}
  if(c==="'"||c==='"'||c==='`'){quoted=c;continue;}
  if((i===0||!/[\w]/.test(sql[i-1]))&&/^WHERE\b/i.test(sql.slice(i)))return sql.slice(i+5);
 }return null;
}
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!p.taskContext.type.some(t=>/^(UPDATE|DELETE)$/i.test(t)))return;
 const table=p.taskContext.table,info=table.table_info,description=p.taskContext.description;let used=false,wrote=false;
 const fields=new Map(info.columns.map((c,i)=>[canonical(c.name).toLowerCase(),{name:c.name,index:i,values:[...new Set(info.rows.map(r=>String(r[i]??'')).filter(Boolean))]}]));
 function discover(sql,requireMissing){
  const where=wherePart(sql);if(where===null)return null;
  for(const m of where.matchAll(/(?<![\w.])(`(?:``|[^`])+`|[A-Za-z_]\w*)\s*=\s*'((?:''|\\.|[^'\\])*)'/g)){
   const field=fields.get(canonical(m[1].replace(/^`|`$/g,'')).toLowerCase());if(!field||!/name|team|club|player|driver|country|nation|school|college|institution|venue|city|opponent/i.test(field.name))continue;
   const at=description.toLowerCase().indexOf('`'+canonical(field.name).toLowerCase()+'`');if(at>=0&&/exact|literal|verbatim/i.test(description.slice(at,at+field.name.length+110)))continue;
   const needle=m[2].replace(/''/g,"'").replace(/\\'/g,"'");if(!needle.trim())continue;const lower=needle.toLowerCase();if(requireMissing&&field.values.some(v=>v.toLowerCase()===lower))continue;
   const alternatives=field.values.filter(v=>v.toLowerCase()!==lower&&v.toLowerCase().includes(lower));if(!alternatives.length)continue;
   const literal=needle.replace(/\\/g,'\\\\').replace(/'/g,"''"),replacement=m[1]+" LIKE '%"+literal+"%'",body=where.slice(0,m.index)+replacement+where.slice(m.index+m[0].length);
   return {query:'SELECT * FROM '+quote(table.table_name)+' WHERE '+body.trim(),field:field.name,needle,alternatives:alternatives.slice(0,8)};
  }return null;
 }
 function initialMatches(sql){
  const where=wherePart(sql);if(where===null||/\bOR\b/i.test(where.replace(/'(?:''|\\.|[^'\\])*'/g,'')))return null;
  const tests=[];for(const m of where.matchAll(/(`(?:``|[^`])+`|[A-Za-z_]\w*)\s*=\s*'((?:''|\\.|[^'\\])*)'/g)){const f=fields.get(canonical(m[1].replace(/^`|`$/g,'')).toLowerCase());if(f)tests.push({index:f.index,value:m[2].replace(/''/g,"'").toLowerCase()});}
  return tests.length?info.rows.some(row=>tests.every(t=>String(row[t.index]??'').toLowerCase()===t.value)):null;
 }
 const guidance=hint=>'The public entity field '+JSON.stringify(hint.field)+' contains these different original spellings for the requested name '+JSON.stringify(hint.needle)+': '+JSON.stringify(hint.alternatives)+'. An empty exact name lookup does not establish that the requested records are absent. Discover the actual rows with '+JSON.stringify({query:hint.query})+'. This is a SELECT discovery query; it preserves the other predicates. Keep all exact constraints from the task, then use the actual returned entity spelling for the requested modification and commit. No write or final submission has happened from this suggestion.';
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||used||wrote||p.getVisibleInput().step>=14)return d;
  const query=args(call).query;if(!/^\s*(?:SELECT|UPDATE|DELETE)\b/i.test(query))return d;const hint=discover(query,true)||((/^\s*(?:UPDATE|DELETE)\b/i.test(query)&&initialMatches(query)===false)?discover(query,false):null);if(!hint)return d;used=true;const reason=guidance(hint);
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;const raw=p.getRawBusinessResult(call.callId);if(!raw||raw.error||/^\s*(?:\d{4}\s*\(|Error\b)/i.test(raw.content))return d;
  const query=args(call).query;if(/^\s*(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(query)){wrote=true;return d;}
  if(used||wrote||p.getVisibleInput().step>=14||!/^\s*SELECT\b/i.test(query)||raw.content.trim()!=='[]')return d;const hint=discover(query,false);if(!hint)return d;used=true;const annotation=guidance(hint);
  p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
