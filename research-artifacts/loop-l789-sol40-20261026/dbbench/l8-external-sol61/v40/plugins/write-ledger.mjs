export const name = 'write-ledger';
const sqlOf = call => call.name === 'execute_sql' && typeof call.arguments?.query === 'string'
 ? call.arguments.query.trim().replace(/;\s*$/, '') : '';
const isWrite = sql => /^(INSERT|UPDATE|DELETE)\b/i.test(sql);
export function apply(ctx) {
 ctx.on('benchmark/setup', async (p, next) => {
  await next();
  const executed = new Set();
  const blocked = new Set();
  let lastWrite = '';
  const missingCall = () => (p.getVisibleInput().messages || []).some(m =>
   m.role === 'user' && typeof m.content === 'string' && m.content.includes('No executable tool calls found'));
  const lastAssistantText = () => {
   const event = p.agent.session.snapshotEvents().findLast(e => e.type === 'assistant/message');
   return (event?.data.message.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  };
  p.ac.on('tools/pre-execute', async (call, next) => {
   const decision = await next();
   if (decision.kind !== 'allow') return decision;
   const sql = sqlOf(call);
   if (executed.has(sql) && (missingCall() || blocked.has(sql))) {
    blocked.add(sql);
    const reason = 'This exact write already executed without a SQL error. Missing tool-call feedback concerns your latest response, not that earlier SQL. Do not execute it again. If all requested operations are complete, call commit_final_answer using the function API with {"answers":[]}; otherwise perform the remaining distinct operation or a SELECT to inspect current rows.';
    p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
    return {kind:'deny',reason};
   }
   return decision;
  });
  p.ac.on('tools/post-execute', async (call, result, next) => {
   const decision = await next();
   if (decision.kind !== 'accept') return decision;
   const sql = sqlOf(call);
   const raw = p.getRawBusinessResult(call.callId);
   if (!isWrite(sql) || !raw || raw.error || result.isError || /^(?:\d{4}\s*\(|Error\b)/i.test(String(raw.content).trim())) return decision;
   executed.add(sql);
   lastWrite = sql;
   const annotation = 'Execution ledger: this SQL statement ran without a SQL error. A write response [] does not report how many target rows matched. Finish any remaining requested operations; then submit with the actual commit_final_answer function, arguments {"answers":[]}. A plain-text final answer does not submit. Do not repeat this write merely because submission was missing.';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
  });
  p.ac.on('system-prompt/assemble', async (a, c, next) => {
   const r = await next();
   if (!executed.size) return r;
   const recovery = missingCall() && /commit_final_answer|final answer|task (?:is )?complete|operation (?:is )?complete/i.test(lastAssistantText());
   const text = 'Actual SQL execution ledger: ' + executed.size + ' distinct write statements returned without SQL errors in this episode. This does not prove affected-row counts. Last executed write: ' + lastWrite
    + (recovery ? '\nSubmission recovery: your final response lacked an executable function call. Earlier SQL is still executed. If all requested changes are complete, use the commit_final_answer function with {"answers":[]} now. Keep any remaining requested changes; do not reinsert completed rows.' : '\nFinish all remaining requested operations, then use the commit_final_answer function to submit.');
   p.audit({method_id:name,hook:'system-prompt/assemble',text,recovery});
   const tools = recovery ? r.tools.map(t => t.name === 'commit_final_answer'
    ? {...t,description:t.description + '\nSubmission recovery: select this function when all requested writes are finished; arguments {"answers":[]}. The executed SQL remains in effect.'} : t) : r.tools;
   return {...r,tools,sections:[...r.sections,{name,order:30,text,interpolate:false}]};
  });
 });
}
