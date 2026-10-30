export const name = 'task-contract';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit,taskContext,getRawBusinessResult}, next) => {
    await next();
    const publicContext = {};
    for(const key of ['type','evidence','add_description']) {
      const value = taskContext?.[key];
      if(value !== undefined && value !== null && value !== '') publicContext[key] = value;
    }
    const types = new Set((Array.isArray(taskContext?.type) ? taskContext.type : [taskContext?.type]).map(value => String(value).toUpperCase()));
    const table = String(taskContext?.add_description ?? '').match(/The name of this table is (.+?), and the headers of this table are/s)?.[1];
    const inspect = table ? ' Execute this inspection query first: SELECT * FROM `' + table.replaceAll('`','``') + '` LIMIT 3;' : ' Inspect the provided table with execute_sql first.';
    let selected = false;
    let inserted = false;
    let reminded = false;
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const text = `Official public task context: ${JSON.stringify(publicContext)}
Use the official task type to identify the requested operation. If it specifies insertion or modification, perform that operation with execute_sql even when the description is written in past tense (such as a record "has been added"). The description is the requested target state, not an execution receipt. Only an actual successful tool result proves that you have performed an operation.
Interpret the scope of predicates precisely: "contains the exact phrase" means substring matching, not equality of the whole cell. Use a case-sensitive substring predicate when requested; whole-cell equality applies only when the task requires the entire value to match. Preserve any explicitly requested row scope and exact replacement text.`;
      audit({method_id:name,hook:'system-prompt/assemble',call_id:null,text});
      return {...result,sections:[...result.sections,{name,order:35,text,interpolate:false}]};
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if(decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      let args = call.arguments;
      if(typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      const raw = getRawBusinessResult(call.callId);
      if(raw?.error || !String(raw?.content ?? '').trim().startsWith('[')) return decision;
      if(/^\s*SELECT\b/i.test(args?.query ?? '')) selected = true;
      if(/^\s*INSERT\b/i.test(args?.query ?? '')) inserted = true;
      return decision;
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if(decision.kind !== 'allow' || call.name !== 'commit_final_answer' || reminded) return decision;
      let reason = '';
      if(types.has('INSERT') && !inserted) {
        reason = 'The official public task type is INSERT, but no INSERT has executed successfully. The description specifies the requested new record; past-tense wording is not proof that it already exists.' + inspect + ' Then perform the requested INSERT using the task details before submitting the final answer.';
      } else if(types.has('SELECT') && !selected) {
        reason = 'The official public task type is SELECT, but no SELECT has executed successfully. Column headers alone cannot establish that a requested value is absent: it may be stored inside cells.' + inspect + ' Then query the requested result from the actual data before submitting the final answer.';
      }
      if(!reason) return decision;
      reminded = true;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
