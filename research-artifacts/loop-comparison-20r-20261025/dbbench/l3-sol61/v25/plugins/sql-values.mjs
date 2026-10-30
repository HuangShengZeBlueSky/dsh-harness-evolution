export const name='sql-values';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getRawBusinessResult}=p;const isWrite=[p.taskContext?.type].flat().some(t=>/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(String(t)));
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(isWrite){audit({method_id:name,hook:"system-prompt/assemble",annotation:"Write mode: omit static query guidance; retain actual SELECT-result diagnostics."});return r;}
   const text='Query value semantics: Database columns are usually TEXT. For numeric MIN/MAX, ordering, ranges and totals, use a numeric CAST; remove thousands commas with REPLACE when needed. Text order puts 10 before 2. Dates with month names must be compared chronologically, not alphabetically: inspect the format and use STR_TO_DATE or inspect all relevant dates. A last win may be encoded Winner or W, not Win; inspect DISTINCT values when a guessed filter finds nothing. Inspect actual entity values before assuming names/country codes. If no rows truly answer the question, use answers:[], never [""]. Public task hints: '+JSON.stringify({type:p.taskContext?.type,evidence:p.taskContext?.evidence});
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:45,text,interpolate:false}]};
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   const raw=getRawBusinessResult(call.callId),q=call.arguments.query;
   if(!raw||raw.error||result.isError||!/^\s*SELECT\b/i.test(q)||/^\d{4}\s*\(/.test(raw.content))return d;
   const notes=[];
   if(raw.content.trim()==='[]'&&/\b(WHERE|HAVING)\b/i.test(q))notes.push('No matching rows. If your filter used an assumed spelling or label, inspect DISTINCT values of the filtered columns, then correct the filter. Do not turn an empty result into an empty-string answer.');
   if(/ORDER\s+BY[\s\S]*date/i.test(q)&&!/STR_TO_DATE/i.test(q)&&/January|February|March|April|May|June|July|August|September|October|November|December/i.test(raw.content))notes.push('Chronology check: this query ordered month-name date TEXT alphabetically. Requery with STR_TO_DATE using the observed date format, or inspect all relevant dates before choosing latest/earliest.');
   if(!/CAST\s*\(|CONVERT\s*\(/i.test(q)&&/(?:MIN|MAX)\s*\(\s*`?(?:Rank|Year|Season|Points|Total|Attendance)|ORDER\s+BY\s+`?(?:Rank|Year|Season|Points|Total|Attendance)/i.test(q))notes.push('Numeric ordering check: these fields are TEXT. If the requested order is numerical, cast the cleaned field to a number before MIN, MAX or ORDER BY.');
   if(!notes.length)return d;
   const annotation='\n\n'+notes.join('\n');audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
