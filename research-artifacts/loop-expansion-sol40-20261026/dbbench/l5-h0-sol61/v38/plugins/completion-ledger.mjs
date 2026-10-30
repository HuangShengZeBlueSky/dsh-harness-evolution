export const name='completion-ledger';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
const key=q=>q.trim().replace(/;\s*$/,'');
const isWrite=q=>/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(q);
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const mode=p.taskContext.type[0];let reads=0,writes=0,reminded=false,last='No SQL has executed yet.';const done=new Set();
 p.ac.on('system-prompt/assemble',async(a,c,n)=>{
  const r=await n();const text='Execution and completion state: task operation '+mode+'; successful read statements '+reads+'; successful write statements '+writes+'. '+last+'\nUse actual function calls, not XML or a SQL block as a substitute. execute_sql arguments: {"query":"one SQL statement"}; commit_final_answer arguments: {"answers":["value"]}, an object, never a bare array. Explain your choice and actually call the tool. For a write task execute the requested change, optionally verify with a targeted SELECT, then commit_final_answer. Successful write returning [] means it executed; it does not mean zero rows changed. Never repeat a successful INSERT or incremental UPDATE because the result is []. For a read task commit only requested query values, no commentary, preserving result order and exact text.';
  p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:40,text,interpolate:false}],tools:r.tools.map(t=>({...t,description:t.description+(t.name==='commit_final_answer'?' Call with JSON object {"answers":["value"]} after real SQL execution.':' Call with JSON object {"query":"SQL"}; execute one statement.')}))};
 });
 p.ac.on('tools/pre-execute',async(c,n)=>{
  const d=await n();if(d.kind!=='allow')return d;let reason='';
  if(c.name==='execute_sql'){const q=args(c).query;if(isWrite(q)&&done.has(key(q)))reason='This exact write already executed successfully. Do not repeat it. SELECT the changed rows if needed, then commit_final_answer.';}
  if(c.name==='commit_final_answer'&&!reminded&&(/INSERT|UPDATE|DELETE/.test(mode)?writes===0:reads===0)){reminded=true;reason='No successful '+mode+' execution is recorded. First execute_sql with the required operation and exact public schema, inspect the result, then commit. Proposed SQL or narrative does not modify the database.';}
  if(reason){p.audit({method_id:name,hook:'tools/pre-execute',call_id:c.callId,decision:'deny',reason});return {kind:'deny',reason};}return d;
 });
 p.ac.on('tools/post-execute',async(c,result,n)=>{
  const d=await n();if(d.kind!=='accept'||c.name!=='execute_sql')return d;const raw=p.getRawBusinessResult(c.callId);if(!raw)return d;
  const q=args(c).query,failed=raw.error||/^\s*(?:\d{4}\s*\(|Error\b)/i.test(raw.content);let annotation;
  if(failed){last='Last SQL failed; no completion is established.';annotation='SQL failed. Correct the identifier, value or syntax indicated by this actual error. Do not claim this operation completed.';}
  else if(isWrite(q)){writes++;done.add(key(q));last='A write executed successfully. Verify if necessary and commit; do not repeat it.';annotation='Write execution succeeded. Empty [] is normal for a write. Do not execute this write again; verify with SELECT if needed, then commit_final_answer.';}
  else{reads++;last='A read query executed successfully.';annotation='Use this actual query result as evidence; when requested data is available, submit it with commit_final_answer.';}
  p.audit({method_id:name,hook:'tools/post-execute',call_id:c.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
