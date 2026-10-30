export const name = 'record-submit-review';
function multiColumnRows(text) {
 if (!text.startsWith('[') || !text.endsWith(']') || text.includes('[TRUNCATED]')) return;
 const rows = [];
 let quote = '', escaped = false, depth = 0, start = -1, commas = 0, lastComma = -1;
 for (let i = 1; i < text.length - 1; i++) {
  const ch = text[i];
  if (quote) {
   if (escaped) escaped = false;
   else if (ch === '\\') escaped = true;
   else if (ch === quote) quote = '';
   continue;
  }
  if (ch === "'" || ch === '"') { quote = ch; continue; }
  if (ch === '(') {
   if (depth++ === 0) { start = i; commas = 0; lastComma = i; }
  } else if (ch === ',' && depth === 1) {
   commas++;
   lastComma = i;
  } else if (ch === ')') {
   depth--;
   if (depth === 0) {
    const fields = commas + (text.slice(lastComma + 1, i).trim() ? 1 : 0);
    if (fields < 2) return;
    rows.push(text.slice(start, i + 1));
   }
  }
 }
 if (depth === 0 && !quote && rows.length) return rows;
}
export function apply(ctx) {
 ctx.on('benchmark/setup', async (p,next) => {
  await next();
  const tc = p.taskContext || {};
  const description = String(tc.description || '');
  if (/INSERT|UPDATE|DELETE/i.test(String(tc.type || ''))) return;
  if (!/\b(list|display|show|provide|find|retrieve)\b/i.test(description)) return;
  const fullRecords = /\b(?:all|full|complete)\s+(?:records|rows)\b/i.test(description);
  const fields = (tc.table?.table_info?.columns || []).map(c => String(c.name));
  const mentioned = fields.filter(f => description.toLowerCase().includes(f.toLowerCase()));
  if (!fullRecords && !/\bboth\b/i.test(description) && !(/\bfor each\b/i.test(description) && /\band\b/i.test(description)) && !(/\b(display|show)\b/i.test(description) && mentioned.length >= 2)) return;
  let evidence;
  let reviewed = false;
  p.ac.on('tools/post-execute', async (call,result,next) => {
   const decision = await next();
   if (decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
   evidence = undefined;
   const sql = String(call.arguments?.query || '').trim();
   const projection = sql.match(/^SELECT\s+(.*?)\s+FROM\s/i)?.[1];
   if (!projection) return decision;
   const identifier = '(?:`(?:``|[^`])+`|[A-Za-z_]\\w*)';
   const simpleColumns = new RegExp('^' + identifier + '(?:\\s*,\\s*' + identifier + ')+$', 'i');
   if (!simpleColumns.test(projection) && !(fullRecords && projection.trim() === '*')) return decision;
   const raw = p.getRawBusinessResult(call.callId);
   if (!raw || raw.error || result.isError) return decision;
   const rows = multiColumnRows(String(raw.content || '').trim());
   if (rows) evidence = {sql,rows};
   return decision;
  });
  p.ac.on('tools/pre-execute', async (call,next) => {
   const decision = await next();
   if (call.name === 'execute_sql') evidence = undefined;
   if (decision.kind !== 'allow' || call.name !== 'commit_final_answer' || !evidence || reviewed) return decision;
   const remaining = Array.isArray(call.arguments?.answers) ? [...call.arguments.answers] : [];
   let complete = true;
   for (const row of evidence.rows) {
    const index = remaining.indexOf(row);
    if (index < 0) { complete = false; break; }
    remaining.splice(index,1);
   }
   if (complete) return decision;
   reviewed = true;
   const reason = 'Record submission review: this answer has not been submitted. The question explicitly requests multiple fields for each qualifying record. The latest successful explicit projection was: ' + evidence.sql + '. Preserve each row\'s field relationship and original values; a count alone or comma/colon prose loses the requested records. If this query answers all requested conditions, call the actual commit_final_answer function with ' + JSON.stringify({answers:evidence.rows}) + '. These are the actual returned tuple rows, including duplicate rows. If a separate count was requested, the receipt contains ' + evidence.rows.length + ' rows; do not replace the requested records with that count alone. If this query was only diagnostic or incomplete, query the complete requested scope first. This review pauses submission only once; it does not choose or submit an answer for you.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
