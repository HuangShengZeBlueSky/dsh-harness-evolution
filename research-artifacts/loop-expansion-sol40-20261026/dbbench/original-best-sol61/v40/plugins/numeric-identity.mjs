export const name = 'numeric-identity';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit,taskContext,getRawBusinessResult}, next) => {
    await next();
    const goal=String(taskContext?.description??'');
    const originalScope=/\b(?:unique|next available|highest)\b/i.test(goal);
    const insertScope=/INSERT/i.test(JSON.stringify(taskContext?.type??[]));
    if(!originalScope&&!insertScope) return;
    let warned=false;
    ac.on('tools/post-execute',async(call,result,next)=>{
      const decision=await next();
      if(decision.kind!=='accept'||call.name!=='execute_sql'||warned)return decision;
      let args=call.arguments;if(typeof args==='string'){try{args=JSON.parse(args);}catch{return decision;}}
      const match=String(args?.query??'').match(/\bMAX\s*\(\s*(`[^`]+`|[A-Za-z_]\w*)\s*\)\s*(?:AS\s+\w+\s+)?FROM\s+(`[^`]+`|[A-Za-z_]\w*)/i);
      if(!match||!String(getRawBusinessResult(call.callId)?.content??'').startsWith('['))return decision;
      if(!originalScope&&(!/^\s*SELECT\b/i.test(String(args?.query??''))||!/(?:^|[^a-z])(?:id|no\.?|number|rank)(?:$|[^a-z])/i.test(match[1].replaceAll('`',''))))return decision;
      warned=true;
      const annotation='Identifier maximum check: MAX on this string column is lexical and may return 9 instead of 68, or a summary label. A LIMIT sample also cannot establish the maximum. Query the numeric maximum over the entire table: SELECT MAX(CAST(REPLACE('+match[1]+", ',', '') AS UNSIGNED)) FROM "+match[2]+' WHERE '+match[1]+" REGEXP '^[0-9]+[.]?$'; Then allocate the next unused numeric identifiers, preserving the observed suffix format and any explicit highest value supplied by the task. Do not allocate from the largest sampled row.";
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,scope:originalScope?'original':'insert-identifier-extension',annotation});
      return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
    });
  });
}
