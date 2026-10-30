export const name = 'value-grounding';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit,getRawBusinessResult,taskContext}, next) => {
    await next();
    const types = (Array.isArray(taskContext?.type) ? taskContext.type : [taskContext?.type]).map(value => String(value).toUpperCase());
    const uniqueNumberTask = types.includes('INSERT') && /\b(?:unique|next available|highest)\b/i.test(String(taskContext?.description ?? ''));
    const suffixTask = types.includes('UPDATE') && /\bends?\s+with\s+(?:a\s+)?dash\b/i.test(String(taskContext?.description ?? ''));
    let suffixReminded = false;
    let lastMaximum = null;
    let truncationReminded = false;
    let observedRows = false;
    let unresolvedTable = '';
    let reminded = false;
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const text = `Ground the interpretation in stored data. If the requested concept or value format is ambiguous, first inspect a few relevant rows or DISTINCT values with execute_sql. Use what the cells actually contain to choose the predicate and output column; do not infer solely from a header. A score relative to par differs from a total score. If a question says any year and years are separate columns, test the relevant year columns, not a summary column.
Before summing or numerically ordering text values, inspect their format and remove thousands separators or currency symbols before casting. Numeric conversion of '12,345' without removing its comma produces 12. Inspect category codes and composite text before matching a named entity; a label may be abbreviated or embedded in a longer cell.
After a query returns no matches or NULL, inspect relevant stored values before finalizing. For mutations preserve the observed cell style and the exact requested new value. A verification SELECT after a mutation shows the state AFTER your change, not evidence that the change was unnecessary.`;
      audit({method_id:name,hook:'system-prompt/assemble',call_id:null,text});
      return {...result,sections:[...result.sections,{name,order:30,text,interpolate:false}]};
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if(decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      let args = call.arguments;
      if(typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      const query = String(args?.query ?? '');
      const raw = String(getRawBusinessResult(call.callId)?.content ?? '').trim();
      if(raw === '[]' && /^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(query)) {
        unresolvedTable = '';
        suffixReminded = true;
      }
      if(!/^\s*SELECT\b/i.test(query) || !raw.startsWith('[')) return decision;
      const maximum = query.match(/^\s*SELECT\s+MAX\s*\(\s*(`[^`]+`|[A-Za-z_]\w*)\s*\)(?:\s+AS\s+(?:`[^`]+`|[A-Za-z_]\w*))?\s+FROM\s+(`[^`]+`|[A-Za-z_]\w*)\s*;?\s*$/i);
      if(uniqueNumberTask && maximum) lastMaximum = {column:maximum[1],table:maximum[2]};
      let annotation = '';
      const from = query.match(/\bFROM\s+(`[^`]+`|[^\s;]+)/i)?.[1];
      if(suffixTask && !suffixReminded && from) {
        const containsDash = query.match(/(`[^`]+`|[A-Za-z_]\w*)\s+LIKE\s+'%([-–—])%'/i);
        if(containsDash) {
          suffixReminded = true;
          annotation = 'Suffix predicate check: LIKE with a wildcard on both sides tests whether a dash occurs anywhere; it does not test whether the cell ends with a dash. Its matches may be completed ranges, and ASCII hyphens may differ from stored Unicode dashes. Inspect the complete stored values without that filter: SELECT DISTINCT ' + containsDash[1] + ' FROM ' + from + '; For the requested suffix, test the final character after trimming trailing spaces, using the actual observed dash character (for example RIGHT(RTRIM(' + containsDash[1] + '), 1)). Preserve the original condition excluding completed terms or Present and the exact requested append text. Then execute the requested conditional UPDATE; this SELECT has not performed the modification. Do not append to completed ranges or infer absence from the contains-dash subset.';
        }
      }
      if(lastMaximum && !truncationReminded && raw.includes('[TRUNCATED]') && from === lastMaximum.table) {
        truncationReminded = true;
        annotation = 'Maximum/uniqueness check: this displayed result is truncated. Larger identifiers or ranks may occur in omitted rows, so the largest visible value is not a verified table maximum. Reduce the output to the required column: SELECT ' + lastMaximum.column + ' FROM ' + lastMaximum.table + '; Determine the maximum numerically from the complete column, excluding nonnumeric summary labels, or query a numeric scalar maximum. Then choose unused values as requested. Keep any identifier explicitly fixed by the task unchanged.';
      }
      if(raw === '[]' && /\bWHERE\b/i.test(query) && !observedRows) {
        unresolvedTable = query.match(/\bFROM\s+(`[^`]+`|[^\s;]+)/i)?.[1] ?? '';
      } else if(raw !== '[]' && !/^\[\(\s*(?:None|NULL)\s*,?\s*\)\]$/i.test(raw)
          && !/\b(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(query)) {
        observedRows = true;
        unresolvedTable = '';
      }
      if(annotation) {
        audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
        return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
      }
      return decision;
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if(decision.kind !== 'allow' || call.name !== 'commit_final_answer' || !unresolvedTable || reminded) return decision;
      reminded = true;
      const reason = 'A filtered SELECT returned no rows, but you have not inspected nonempty stored values. An empty result can come from an incorrect predicate, category spelling or date conversion. Inspect the raw cells before concluding the data is absent: SELECT * FROM ' + unresolvedTable + ' LIMIT 3; Then revise the query only as supported by the observed data and the original question. A NULL produced by a conversion does not prove the raw column is empty. Do not invent an unspecified year or change the requested scope.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
