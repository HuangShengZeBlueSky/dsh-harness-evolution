export const name = 'query-submit';
export function apply(ctx) {
 ctx.on('benchmark/setup', async (p, next) => {
  await next();
  const tc = p.taskContext || {};
  if (/insert|update|delete/i.test(String(tc.type || '')) || /\b(add|insert|update|correct|change|modify|delete|remove|set)\b/i.test(tc.description || '')) return;
  let lastSelect;
  p.ac.on('tools/post-execute', async (call, result, next) => {
   const decision = await next();
   if (decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
   lastSelect = undefined;
   const sql = call.arguments?.query || '';
   const raw = p.getRawBusinessResult(call.callId);
   const receipt = String(raw?.content || '').trim();
   if (/^\s*SELECT\b/i.test(sql) && raw && !raw.error && !result.isError && receipt.startsWith('[') && receipt !== '[]') {
    lastSelect = {sql,receipt};
    p.audit({method_id:name,hook:'tools/post-execute',annotation:'Recorded actual nonempty SELECT receipt for submission recovery.'});
   }
   return decision;
  });
  p.ac.on('system-prompt/assemble', async (a, c, next) => {
   const r = await next();
   const missing = (p.getVisibleInput().messages || []).some(m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('No executable tool calls found'));
   if (!lastSelect || !missing) return r;
   const event = p.agent.session.snapshotEvents().findLast(e => e.type === 'assistant/message');
   const reply = (event?.data.message.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
   if (!/commit_final_answer|final answer/i.test(reply)) return r;
   let pending = '';
   const match = reply.match(/commit_final_answer\s*(?:\(\s*)?(\[[\s\S]*\])/i);
   if (match) {
    try {
     const answers = JSON.parse(match[1]);
     if (Array.isArray(answers) && answers.every(x => typeof x === 'string')) pending = '\nYour proposed submission arguments: ' + JSON.stringify({answers});
    } catch {}
   }
   const text = 'Query submission recovery: the latest reply did not call a function. A SELECT already returned data.\nSQL: ' + lastSelect.sql
    + '\nLatest actual receipt excerpt (full receipt remains in the conversation): ' + lastSelect.receipt.slice(0,3000)
    + '\nChoose the fields and answer scope requested by the question. If the evidence answers it, call the actual commit_final_answer function with an object containing answers, an array of strings. Put each requested answer in that array. Continue querying if the last query was only diagnostic. A prose promise or Python tuple list does not submit.' + pending;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   const tools = r.tools.map(t => t.name === 'commit_final_answer' ? {...t,description:t.description + '\nSubmission recovery: use this function to submit chosen answers from the SQL evidence. Arguments must be an object with an answers array of strings.'} : t);
   return {...r,tools,sections:[...r.sections,{name,order:35,text,interpolate:false}]};
  });
 });
}
