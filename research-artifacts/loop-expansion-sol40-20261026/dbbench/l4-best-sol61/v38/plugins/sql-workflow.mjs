export const name = 'sql-workflow';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, getRawBusinessResult, taskContext} = payload;
    const apostropheWords = [...new Set(String(taskContext?.description ?? '').match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)+/gu) ?? [])];
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const text = `SQL execution checklist:
Explain the next operation briefly, then make an actual tool call every turn. Writing execute_sql(...) or commit_final_answer(...) as prose does not execute anything.
Use the exact table and column names provided. Enclose every table and column identifier in MySQL backticks, including Rank, spaces, punctuation and numeric column names. Do not replace spaces with underscores. Use single quotes for string values and escape embedded apostrophes.
Preserve exact requested text, punctuation, date spacing and Unicode dashes (– differs from -). If a SELECT unexpectedly returns [], inspect relevant stored values before concluding there is no match.
For numeric comparison, arithmetic, MIN/MAX or sorting on text columns, explicitly convert to numbers when the question intends numeric values; remove thousands separators where needed. Keep string comparisons when explicitly requested.
A successful INSERT/UPDATE/DELETE normally returns []; it is not an affected-row count. Do not repeat an already successful mutation. If verification is needed, use SELECT instead.
Answer retrieval questions with only the requested result values in the answers array, without labels, explanations or sentences. A count question needs the count, not a player's name. For modifications, perform the requested SQL successfully before committing. Use the real commit_final_answer tool to finish.`;
      audit({method_id:name, hook:'system-prompt/assemble', call_id:null, text});
      return {...result, sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if(decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      const raw = getRawBusinessResult(call.callId);
      const content = String(raw?.content ?? '');
      let args = call.arguments;
      if(typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      let annotation = '';
      if(/^\d{4}\s*\(/.test(content)) {
        annotation = 'This is a MySQL error, not a result value. Correct the query using the exact identifiers in backticks; do not submit this error as the answer.';
        const unescaped = apostropheWords.filter(word => String(args?.query ?? '').includes(word));
        if(/^1064\s*\(/.test(content) && unescaped.length) {
          annotation += '\nSQL string-literal repair: the attempted query contains an embedded apostrophe from the task. Inside a single-quoted SQL value, double that apostrophe. Use this SQL spelling: ' + unescaped.map(word => word.replaceAll("'", "''")).join(', ') + '. This preserves the original value in the database. Backticks are for identifiers and cannot fix a quote inside a string value. Correct the value before retrying; the failed statement did not execute.';
        }
      }
      else if(content.trim() === '[]' && /^\s*(INSERT|UPDATE|DELETE)\b/i.test(args?.query ?? '')) annotation = '\nSQL execution receipt: the preceding mutation executed without an SQL error. [] means no result set; it gives no affected-row count. Do not repeat this mutation. If all requested statements have run, finish now by invoking the actual commit_final_answer function through the tool API. For a database modification, its answers argument may be an empty array. Writing a function name or answer in assistant text does not finish the task.';
      if(!annotation) return decision;
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
}
