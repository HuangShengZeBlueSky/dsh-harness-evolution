export const name='listed-count';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
  await next();const goal=String(taskContext?.description??'');
  if(/INSERT|UPDATE|DELETE/i.test(JSON.stringify(taskContext?.type??[]))||!/\bhow many\b/i.test(goal)||!/\b(?:on|in) (?:the )?(?:chart|table|list)\b/i.test(goal)||/\b(?:distinct|unique|different)\b/i.test(goal))return;
  let reminded=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||reminded)return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??'');if(!/^\s*SELECT\b/i.test(sql))return d;let changed=false;
   const repaired=sql.replace(/\bCOUNT\s*\(\s*DISTINCT\s+(`[^`]+`|[A-Za-z_]\w*)\s*\)/gi,(_,field)=>{changed=true;return 'COUNT('+field+')';});
   if(!changed)return d;reminded=true;
   const reason='Listed-occurrence count: the question asks how many entries are on the chart and does not request different or unique values. DISTINCT silently collapses repeated entries. Count the requested column occurrences while preserving the existing scope: '+repaired+' This blocked query has not executed.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
