export const name='aggregate-format';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());if(types.some(x=>/INSERT|UPDATE|DELETE/.test(x)))return;
  let pending=null,started=false,commitWarned=false;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??''),raw=String(getRawBusinessResult(call.callId)?.content??'').trim();if(!raw.startsWith('['))return d;
   let annotation='';
   if(pending&&/\b(?:SUM|AVG)\s*\([\s\S]*(?:CAST|REPLACE)\s*\(/i.test(sql)){pending=null;return d;}
   if(pending&&sql===pending.probe){
    if(raw==='[]'){pending=null;return d;}
    annotation='Aggregate input receipt: these are the actual cells being aggregated. Thousands separators or currency prefixes must be removed before numeric conversion; implicit conversion can sum only the leading digits. Recompute the original aggregate with its original predicates: '+pending.repair;
   }else if(!started&&!/None|NULL|\[TRUNCATED\]/i.test(raw)){
    const m=sql.match(/^\s*SELECT\s+((SUM|AVG)\s*\(\s*(`[^`]+`|[A-Za-z_]\w*)\s*\))(?:\s+AS\s+(?:`[^`]+`|\w+))?\s+(FROM\s+[\s\S]*)$/i);
    if(!m||!/votes|sales|revenue|profit|population|attendance|crowd|employees/i.test(m[3])||/\b(?:GROUP\s+BY|HAVING|UNION)\b/i.test(m[4]))return d;
    started=true;const column='`'+m[3].replace(/^`|`$/g,'').replaceAll('`','``')+'`';
    const probe='SELECT '+column+' '+m[4];
    const expression=m[2]+'(CAST(REPLACE(REPLACE('+column+", ',', ''), '$', '') AS DECIMAL(30,8)))";
    const repair=sql.replace(m[1],()=>expression);pending={probe,repair};
    annotation='Aggregate representation check: this query aggregates a text quantity without observing its stored format. Inspect the actual input cells using '+probe+' Then remove any grouping commas or currency signs before accepting the numerical sum or average. Keep the original row predicate.';
   }
   if(!annotation)return d;audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||!pending||commitWarned)return d;commitWarned=true;
   const reason='The numerical aggregate still uses unchecked text conversion. Inspect its real input format with '+pending.probe+' Then execute the normalized aggregate '+pending.repair+' and submit that actual result.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
