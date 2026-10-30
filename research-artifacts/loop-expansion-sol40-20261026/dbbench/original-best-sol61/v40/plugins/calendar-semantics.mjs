export const name='calendar-semantics';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();const goal=String(taskContext?.description??'');
  const chronological=/\b(?:first|last|latest|earliest|most recent)\b/i.test(goal);
  const explicitYear=/\b(?:18|19|20)\d{2}\b/.test(goal)||/\b(?:current|this) year\b/i.test(goal);
  let yearWarned=false,sortWarned=false,repair='',commitWarned=false;
  function sqlOf(call){let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return '';}}return String(a?.query??'');}
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow')return d;let reason='';
   if(call.name==='execute_sql'&&!explicitYear&&!yearWarned){
    const sql=sqlOf(call);
    if(/^\s*SELECT\b/i.test(sql)&&/\bWHERE\b[\s\S]*(?:`[^`]*date[^`]*`|\bDate\b)[\s\S]*(?:['"]%?|[=<>]\s*)(?:18|19|20)\d{2}/i.test(sql)){
     yearWarned=true;reason='The task specifies no year, but this date predicate invents one. Keep the requested month/day or relative chronology without adding an unsupported calendar year. Inspect the stored date strings and use their actual format. The blocked SELECT has not executed.';
    }
   }else if(call.name==='commit_final_answer'&&repair&&!commitWarned){
    commitWarned=true;reason='The last-date answer still comes from lexical text order. Execute the calendar-order query first: '+repair+' Then commit the result from its actual receipt.';
   }
   if(!reason)return d;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql'||!chronological)return d;
   const sql=sqlOf(call),raw=String(getRawBusinessResult(call.callId)?.content??'').trim();if(!raw.startsWith('['))return d;
   if(/\bORDER\s+BY\s+[\s\S]*STR_TO_DATE\s*\(/i.test(sql)){repair='';return d;}
   if(sortWarned||!/^\s*SELECT\b/i.test(sql))return d;
   const m=sql.match(/\bORDER\s+BY\s+(`[^`]+`|[A-Za-z_]\w*)(?=\s*(?:ASC\b|DESC\b|LIMIT\b|;|,|$))/i);if(!m||!/date/i.test(m[1]))return d;
   let format='';
   if(/['"]\d{1,2}\s+[A-Za-z]+\s+\d{4}['"]/.test(raw))format='%e %M %Y';
   else if(/['"][A-Za-z]+\s+\d{1,2},\s*\d{4}['"]/.test(raw))format='%M %e, %Y';
   else if(/['"][A-Za-z]+\s+\d{1,2}\s+\d{4}['"]/.test(raw))format='%M %e %Y';
   if(!format)return d;sortWarned=true;
   const expression='STR_TO_DATE('+m[1]+", '"+format+"')";
   repair=sql.replace(m[0],()=>m[0].replace(m[1],()=>expression));
   const annotation='Calendar-order check: this receipt shows dates stored as formatted text. Alphabetical date order is not chronological order. Preserve the requested filters and output columns, but parse the observed date format before ordering: '+repair;
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
