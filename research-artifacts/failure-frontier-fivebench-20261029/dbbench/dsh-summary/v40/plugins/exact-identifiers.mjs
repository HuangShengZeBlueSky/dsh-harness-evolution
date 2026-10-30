export const name = 'exact-identifiers';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const { ac, audit, getRawBusinessResult } = payload;
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const text = 'SQL dialect: MySQL. Use the exact table and column names supplied in the task, preserving spaces, punctuation and case; do not replace spaces with underscores. Enclose each full table name and each column name in backticks, including simple names such as `Rank`. Single quotes are for string values. On a SQL error, fix the identifier named by the error before changing the query logic; do not repeat unchanged failing SQL.';
      audit({ method_id: name, hook: 'system-prompt/assemble', text });
      return { ...result, sections: [...result.sections, { name, order: 25, text, interpolate: false }] };
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || !/^(1064|1146|1054)\b/.test(String(raw.content).trim())) return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const quote=String.fromCharCode(39),slash=String.fromCharCode(92);
      const unescaped=String(args?.query||'').split(slash+quote).join('');
      const oddQuotes=(unescaped.split(quote).length-1)%2===1;
      const annotation=String(raw.content).trim().startsWith('1064')&&oddQuotes
        ? "String-literal recovery: this SQL has an unmatched single quote. Represent an apostrophe inside a quoted text value with two single quotes, for example 'O''Brien'. Preserve the intended text and retry corrected SQL. Backticks quote identifiers and do not escape apostrophes inside values. The failing call did not complete the database operation."
        : 'SQL recovery: compare identifiers against the original supplied table/header names. Use backticks around the full table and every column (especially `Rank` and names with spaces or punctuation). A 1064 syntax error does not establish that INSERT, CAST or REGEXP is unsupported. Correct the failing token, then execute the corrected SQL; this failed call did not complete the requested operation.';
      audit({ method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation });
      return { ...decision, content: [...(decision.content || result.content), { type: 'text', text: annotation }] };
    });
  });
}
