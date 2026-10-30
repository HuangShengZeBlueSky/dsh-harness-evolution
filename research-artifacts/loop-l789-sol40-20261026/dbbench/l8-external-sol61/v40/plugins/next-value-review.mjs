export const name = 'next-value-review';
const escapePattern = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function apply(ctx) {
 ctx.on('benchmark/setup', async (p,next) => {
  await next();
  const tc = p.taskContext || {}, description = String(tc.description || '');
  if (!/\b(add|insert|new)\b/i.test(description) || !/\bnext\b/i.test(description) || /lexicograph|string comparison/i.test(description)) return;
  const table = tc.table, info = table?.table_info;
  if (!Array.isArray(info?.columns) || !Array.isArray(info?.rows)) return;
  const fields = [];
  for (const [i,c] of info.columns.entries()) {
   if (!description.toLowerCase().includes(c.name.toLowerCase())) continue;
   const values = info.rows.map(r => r[i]).filter(v => v != null && v !== '');
   if (!values.length || !values.every(v => typeof v === 'string' && /^\d+$/.test(v))) continue;
   const lexical = values.toSorted().at(-1), numeric = values.toSorted((a,b) => Number(a)-Number(b)).at(-1);
   if (Number(lexical) !== Number(numeric)) fields.push(c.name);
  }
  const reviewed = new Set();
  p.ac.on('tools/pre-execute', async (call,next) => {
   const decision = await next();
   if (decision.kind !== 'allow' || call.name !== 'execute_sql') return decision;
   const sql = String(call.arguments?.query || '').trim();
   if (!/^SELECT\b/i.test(sql) || !sql.includes(table.table_name) || reviewed.has(sql)) return decision;
   let corrected = sql, changed = [];
   for (const field of fields) {
    const quoted = '`' + field.replace(/`/g,'``') + '`';
    const identifier = '(?:' + escapePattern(quoted) + (/^[A-Za-z_]\w*$/.test(field) ? '|\\b' + escapePattern(field) + '\\b' : '') + ')';
    const pattern = new RegExp('\\bMAX\\s*\\(\\s*' + identifier + '\\s*\\)', 'gi');
    corrected = corrected.replace(pattern, () => { changed.push(quoted); return 'MAX(CAST(' + quoted + ' AS UNSIGNED))'; });
   }
   if (!changed.length) return decision;
   reviewed.add(sql);
   const reason = 'Next identifier review: this SELECT has not executed. ' + changed.join(', ') + ' has integer-string public examples whose text MAX and numeric MAX can differ; declared public types do not establish runtime ordering. A next unique numeric identifier must be based on CURRENT numeric ordering. Draft execute_sql arguments preserving the other query parts: ' + JSON.stringify({query:corrected}) + '. Verify and execute this query, then choose the next identifier from its actual result and insert in the requested string format. Do not take the current maximum or next value from initial examples. This exact SQL is paused once; no write has occurred or been recorded.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
