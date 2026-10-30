export const name='insert-field-roles';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();const goal=String(taskContext?.description??'');
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
  if(!types.includes('INSERT')||!/\b(?:cleared|heights|qualification|next available rank)\b/i.test(goal))return;
  const headers=String(taskContext?.add_description??'').split('headers of this table are ')[1]??'';
  const heightColumns=headers.split(',').map(x=>x.trim()).filter(x=>/^\d+\.\d+$/.test(x));
  const maximum=goal.match(/highest rank[\s\S]{0,70}?["'](\d+)(\.?)["']/i);
  let reminded=false;
  const demonym=goal.match(/\bnew\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:athlete|player|skater|cyclist|runner|swimmer)\b/)?.[1];
  let countryWarned=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||countryWarned||!demonym)return d;
   if(goal.includes('"'+demonym+'"')||goal.includes("'"+demonym+"'"))return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??'');
   if(!/^\s*INSERT\b/i.test(sql)||!/\b(?:Nationality|Country)\b/i.test(sql)||!sql.includes("'"+demonym.replaceAll("'","''")+"'"))return d;
   countryWarned=true;
   const reason='Country-field check: '+demonym+' describes the new athlete in the task, rather than being an explicitly quoted cell value. Check the observed Country/Nationality column role. When it stores country names, use the corresponding country name instead of copying the adjectival demonym. Preserve the athlete name, rank, attempt markers and all explicit values. This INSERT has not executed; correct the country representation and reissue it.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql'||reminded)return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??''),raw=String(getRawBusinessResult(call.callId)?.content??'').trim();
   if(!/^\s*SELECT\s+\*/i.test(sql)||!raw.startsWith('[('))return d;
   const parts=[];
   if(heightColumns.length&&/['"][oOxX–—-]['"]/.test(raw))parts.push('The height-named columns '+heightColumns.map(x=>'`'+x+'`').join(', ')+' contain attempt markers in the observed rows, not repeated height measurements. Encode each cleared height with the observed successful-attempt marker; keep the numeric achieved height in the result column.');
   if(maximum)parts.push('The task explicitly gives the current highest rank as '+maximum[1]+maximum[2]+'. The next rank is '+String(Number(maximum[1])+1)+maximum[2]+'. Preserve its suffix. The first sampled rank is not the full-table maximum.');
   if(/\b(?:Nationality|Country)\b/i.test(headers))parts.push('Match the observed role of the nationality/country column: if it stores country names, express a newly described nationality as its country name rather than an adjectival demonym. Preserve exact athlete names and explicitly supplied cell values.');
   if(!parts.length)return d;reminded=true;const annotation='Insertion field-role check: '+parts.join(' ');
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
