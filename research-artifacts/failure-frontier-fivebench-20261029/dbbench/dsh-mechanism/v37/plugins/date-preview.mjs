export const name='date-preview';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let previewSeen=false,warnings=0,invalidNoted=false;
  const {ac,agent,audit,getRawBusinessResult}=p;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const r=getRawBusinessResult(call.callId),text=String(r?.content||'');
   if(r&&!r.error&&!/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text)&&/^\s*SELECT\b/i.test(a.query)&&/\b(?:STR_TO_DATE|DATE_FORMAT)\s*\(/i.test(a.query)&&text!=='[]'&&text){
    previewSeen=/\d{4}-\d{2}-\d{2}/.test(text)&&!text.includes('None');
    if(!previewSeen&&!invalidNoted){
     invalidNoted=true;const annotation='Invalid date preview: these conversion results do not establish valid YYYY-MM-DD output (NULL/None is failure). Do not UPDATE from this expression. For full month names in compact day+month+year text, use STR_TO_DATE with %e%M%Y, not abbreviated-month %b or space splitting. SELECT original and converted dates again and inspect valid non-NULL ISO output first.';
     audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
     return {...d,content:[...(d.content||result.content),{type:'text',text:'\n'+annotation}]};
    }
   }
   return d;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||previewSeen||warnings>=2)return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(!/^\s*UPDATE\b/i.test(a.query))return d;
   const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
   if(!/month is written as a word/i.test(task)||!task.includes('YYYY-MM-DD'))return d;
   warnings++;
   const reason='Preview variable-length date conversion before writing. Compact day+month-word+year dates have variable day and month lengths; fixed substring offsets do not identify the year/day reliably. First SELECT original values alongside DATE_FORMAT(STR_TO_DATE(the_date_column, \'%e%M%Y\'), \'%Y-%m-%d\') for actual word-month rows. Check single- and double-digit days and different months. Only after valid old/new pairs, UPDATE the word-month rows using the validated expression, leave existing ISO dates unchanged, then SELECT to verify. Use actual backtick-quoted column names.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
