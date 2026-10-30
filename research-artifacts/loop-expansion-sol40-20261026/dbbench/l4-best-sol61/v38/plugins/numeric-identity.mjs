export const name = 'numeric-identity';
export function apply(ctx) {
 ctx.on('benchmark/setup', async ({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();
  const goal=String(taskContext?.description??'');
  const enabled=/\b(?:unique|next available|does not duplicate|do not duplicate)\b/i.test(goal);
  let maximum=null, verified=false, reminded=false;
  const argsOf=call=>typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next(); if(d.kind!=='accept'||call.name!=='execute_sql'||!enabled)return d;
   const q=String(argsOf(call)?.query??'');
   const raw=String(getRawBusinessResult(call.callId)?.content??'');
   if(/^\s*SELECT\s+MAX\s*\(/i.test(q)&&raw.startsWith('[')){
    if(/\bCAST\s*\(|\bCONVERT\s*\(|\+\s*0/i.test(q))verified=true;
    else {const m=q.match(/MAX\s*\(\s*(`[^`]+`|\w+)\s*\).*?\bFROM\s+(`[^`]+`|\w+)/i);if(m)maximum={column:m[1],table:m[2]};}
   }
   return d;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||!enabled||verified||reminded||!maximum||call.name!=='execute_sql')return d;
   if(!/^\s*INSERT\b/i.test(String(argsOf(call)?.query??'')))return d;
   reminded=true;
   const reason='Unique numeric identifier check: MAX on a text column is lexicographic; a LIMIT sample cannot prove the maximum. Before inserting run SELECT MAX(CAST('+maximum.column+' AS UNSIGNED)) FROM '+maximum.table+'; Use the returned numeric maximum to choose unused requested ranks or identifiers. Exclude nonnumeric summary labels. This INSERT has not executed.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
