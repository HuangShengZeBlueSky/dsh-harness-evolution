export const name = 'insert-grounding';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit,getRawBusinessResult,taskContext}, next) => {
    await next();
    const goal = String(taskContext?.description ?? '');
    const types = (Array.isArray(taskContext?.type) ? taskContext.type : [taskContext?.type]).map(value => String(value).toUpperCase());
    const followPattern = types.includes('INSERT') && /\b(?:format|pattern|style|convention)s?\b/i.test(goal);
    let observedRows = false;
    let prompted = false;
    let styleReminded = false;
    let blockedUpdate = '';
    let updateCompletionReminded = false;
    function queryOf(call) {
      let args = call.arguments;
      if(typeof args === 'string') {
        try { args = JSON.parse(args); } catch { return ''; }
      }
      return String(args?.query ?? '');
    }
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if(decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      const query = queryOf(call);
      const raw = String(getRawBusinessResult(call.callId)?.content ?? '').trim();
      if(/^\s*UPDATE\b/i.test(query) && raw === '[]') blockedUpdate = '';
      if(/^SELECT\b/i.test(query.trim()) && !/\b(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(query)
          && raw.startsWith('[') && raw !== '[]') {
        observedRows = true;
        if(followPattern && !styleReminded && /^\s*SELECT\s+\*/i.test(query)) {
          styleReminded = true;
          const annotation = 'Insertion format check: the task asks to follow existing data patterns. For a category or note described by meaning rather than supplied as an exact cell value, use the matching observed label verbatim, including capitalization and punctuation; do not insert the instruction sentence or a paraphrase. Keep explicitly supplied new values unchanged. Match each observed label to its actual column, and do not copy unrelated sample facts.';
          audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
          return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
        }
      }
      return decision;
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if(decision.kind !== 'allow') return decision;
      if(call.name === 'commit_final_answer' && blockedUpdate && !updateCompletionReminded) {
        updateCompletionReminded = true;
        const reason = 'The earlier conditional UPDATE was blocked for inspection and has not executed. A LIMIT sample cannot establish that the target is absent from the whole table. Complete the requested update before submitting: if the original condition and new value still match the task, execute that conditional UPDATE now; correct identifiers or stored representations only as supported by the observed data. A conditional UPDATE with no matching rows changes no rows, so sample absence is not a reason to skip it. The originally blocked SQL was: ' + blockedUpdate;
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      if(call.name !== 'execute_sql' || observedRows || prompted) return decision;
      const match = queryOf(call).match(/^\s*(INSERT\s+INTO|UPDATE)\s+(`[^`]+`|[^\s(]+)/i);
      if(!match) return decision;
      if(/^UPDATE/i.test(match[1])) {
        const literal = queryOf(call).match(/^\s*UPDATE\s+(?:`[^`]+`|[^\s(]+)\s+SET\s+(`[^`]+`|[A-Za-z_][\w.]*)\s*=\s*'((?:''|[^'])*)'\s+WHERE\s+(`[^`]+`|[A-Za-z_][\w.]*)\s*(=|LIKE)\s*'((?:''|[^'])*)'\s*;?\s*$/i);
        if(literal) {
          const targetColumn = literal[1].replace(/^`|`$/g,'');
          const predicateColumn = literal[3].replace(/^`|`$/g,'');
          const newValue = literal[2].replaceAll("''", "'");
          const oldValue = (literal[4].toUpperCase() === 'LIKE' ? literal[5].replace(/^%|%$/g,'') : literal[5]).replaceAll("''", "'");
          const explicitColumns = targetColumn === predicateColumn || (goal.includes('`' + targetColumn + '`') && goal.includes('`' + predicateColumn + '`'));
          if(explicitColumns && newValue && oldValue && !/[%_]/.test(oldValue) && goal.includes(newValue) && goal.includes(oldValue)) {
            audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'allow',reason:'The task explicitly supplies the new text and matching old text, with the same column or explicitly named columns. Execute this literal UPDATE without the sample inspection gate.'});
            return decision;
          }
        }
      }
      prompted = true;
      if(types.includes('UPDATE') && /^UPDATE/i.test(match[1]) && /\bWHERE\b/i.test(queryOf(call))) blockedUpdate = queryOf(call);
      const reason = /^INSERT/i.test(match[1])
        ? 'Before inserting, inspect existing row values once to ground any unspecified category labels, empty-value conventions, units and date style. Execute this read-only query first: SELECT * FROM ' + match[2] + ' LIMIT 3; Then insert the requested record. Preserve all explicitly supplied values, including identifiers, dates and quoted text; do not replace them with guesses or copy unrelated sample facts. Only use existing rows to resolve representations the task leaves unspecified. The blocked INSERT has not executed.'
        : 'Before updating without having observed rows, inspect actual stored values once to check which columns contain the requested entity and how predicate values, units and dates are represented. Execute this read-only query first: SELECT * FROM ' + match[2] + ' LIMIT 3; Then perform the requested UPDATE with conditions grounded in the data. Preserve explicitly supplied new values and the requested row scope. Sample rows reveal representation; they cannot prove absence throughout the table. The blocked UPDATE has not executed.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
