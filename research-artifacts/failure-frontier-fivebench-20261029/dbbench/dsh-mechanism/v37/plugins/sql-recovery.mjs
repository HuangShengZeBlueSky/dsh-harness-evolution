export const name = 'sql-recovery';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (p,next) => {
    await next();
    const {ac,agent,audit,getRawBusinessResult,getVisibleInput} = p;
    const inserted = new Set();
    const args = call => typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
    const key = q => q.trim().replace(/;\s*$/, '');
    const schema = () => {
      for (const e of agent.session.snapshotEvents()) {
        if(e.type !== 'user/message') continue;
        const text = (e.data.content || []).filter(x=>x.type==='text').map(x=>x.text).join('\n');
        if(text.includes('The name of this table is')) return text.split('\nQuestion:')[0];
      }
      return '';
    };
    ac.on('system-prompt/assemble',async (a,c,next)=>{
      const result = await next();
      if(!(getVisibleInput().messages || []).some(m=>m.role==='user' && String(m.content).includes('No executable tool calls found'))) return result;
      const text = 'Recovery from missing tool call: use the actual function-call interface, not code or XML in prose. If the requested database operation is already complete, call commit_final_answer with {"answers":["..."]}. Do not repeat a successful INSERT to satisfy this message.';
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
    ac.on('tools/pre-execute', async(call,next)=>{
      const result = await next();
      if(result.kind!=='allow' || call.name!=='execute_sql')return result;
      const q = args(call).query;
      if(!/^\s*INSERT\b/i.test(q) || !inserted.has(key(q)))return result;
      const reason = 'This exact INSERT already executed successfully in this task. Do not insert the same rows again. Use SELECT to inspect the existing inserted rows if necessary, then call commit_final_answer({"answers":["Completed"]}) through the actual function interface.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
    ac.on('tools/post-execute', async(call,result,next)=>{
      const decision=await next();
      if(decision.kind!=='accept' || call.name!=='execute_sql')return decision;
      const q=args(call).query, raw=getRawBusinessResult(call.callId);
      if(!raw)return decision;
      const text=typeof raw.content==='string'?raw.content:JSON.stringify(raw.content);
      let annotation='';
      if(raw.error || /\b(?:1064|1054|1146)\b/.test(text)){
        annotation='SQL recovery: '+schema()+'\nUse these identifiers EXACTLY, enclosed in MySQL backticks. Do not change spaces to underscores or replace Unicode characters with HTML or literal escape sequences. `Rank` requires backticks too. Correct the failed query; the failed write has not completed.';
      }else if(/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(q)){
        if(/^\s*INSERT\b/i.test(q))inserted.add(key(q));
        annotation='This SQL statement executed without an error. An empty result is normal for a write and does not mean it needs repeating. Continue only with remaining requested changes; when complete call the actual commit_final_answer tool with {"answers":["Completed"]}. Do not repeat successful INSERTs.';
      }
      if(/\b1064\b/.test(text)&&/[A-Za-z]'[A-Za-z]/.test(q))annotation+=' Literal apostrophe recovery: an apostrophe inside a SQL string must be escaped by doubling it, not by leaving a single quote that closes the value. Preserve the actual person/name while writing its internal apostrophe as two consecutive single quotes in the SQL statement. JSON escaping alone does not escape SQL. Correct the actual emitted literal before retrying; prior failed writes did not complete.';
      if(!annotation)return decision;
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:'\n'+annotation}]};
    });
  });
}
