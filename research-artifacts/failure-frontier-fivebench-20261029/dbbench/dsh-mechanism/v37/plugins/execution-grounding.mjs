export const name='execution-grounding';
export function apply(ctx){
  ctx.on('benchmark/setup',async(p,next)=>{
    await next();
    const {ac,audit,getRawBusinessResult}=p;
    let successfulSql=false,reminded=false,lastSqlFailed=false,lastError="";
    ac.on('tools/post-execute',async(call,result,next)=>{
      const decision=await next();
      if(decision.kind==='accept'&&call.name==='execute_sql'){
        const raw=getRawBusinessResult(call.callId);
        if(raw){
          const text=String(raw.content);
          lastSqlFailed=!!raw.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text);
          lastError=lastSqlFailed?text.slice(0,900):'';
          if(!lastSqlFailed)successfulSql=true;
        }
      }
      return decision;
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();
      if(decision.kind!=='allow'||call.name!=='commit_final_answer'||(successfulSql&&!lastSqlFailed)||reminded)return decision;
      reminded=true;
      const reason=(lastSqlFailed?'The last SQL statement failed: '+lastError+' Use DESCRIBE on the exact supplied table and correct the actual emitted identifiers, including Unicode dashes or line breaks; then execute the needed operation. ':'')+'No SQL statement has executed successfully in this task. Before finalizing, inspect the actual table with SELECT rather than treating prompt wording or a failed guessed column as database evidence. A table may already be scoped to the named subject, without a separate Player column. If the task describes a record being added, verify whether that record exists; if absent, actually INSERT the described record. Claim a database change only after a successful write. Then use the actual commit_final_answer tool.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
