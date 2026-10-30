export const name = 'date-conversion-review';
const months = 'January February March April May June July August September October November December'.split(' ');
function formatOf(value) {
 const match = String(value).match(/^(\d{1,2})(\s*)([A-Za-z]+)(\s*)(\d{4})$/);
 if (!match || !months.some(m => m.toLowerCase() === match[3].toLowerCase())) return;
 const leftSpace = match[2].length > 0;
 const rightSpace = match[4].length > 0;
 return {format:'%e' + (leftSpace ? ' ' : '') + '%M' + (rightSpace ? ' ' : '') + '%Y', pattern:'^[0-9]{1,2}' + (leftSpace ? '[[:space:]]+' : '') + '(' + months.join('|') + ')' + (rightSpace ? '[[:space:]]+' : '') + '[0-9]{4}$'};
}
export function apply(ctx) {
 ctx.on('benchmark/setup', async (p,next) => {
  await next();
  const tc = p.taskContext || {};
  const description = String(tc.description || '');
  if (!/YYYY-MM-DD/.test(description) || !/month[\s\S]{0,40}(?:word|name)|(?:word|name)[\s\S]{0,40}month/i.test(description)) return;
  const info = tc.table?.table_info;
  if (!Array.isArray(info?.columns) || !Array.isArray(info?.rows)) return;
  const fields = new Map();
  for (const [i,column] of info.columns.entries()) {
   if (!description.includes(column.name)) continue;
   const values = info.rows.map(row => row[i]).filter(v => v !== '' && v != null);
   const words = values.filter(v => !/^\d{4}-\d{2}-\d{2}$/.test(v));
   const formats = words.map(formatOf);
   if (formats.length && formats.every(f => f && f.format === formats[0].format)) fields.set(String(column.name).toLowerCase(), formats[0]);
  }
  if (!fields.size) return;
  const reviewed = new Set();
  p.ac.on('tools/pre-execute', async (call,next) => {
   const decision = await next();
   if (decision.kind !== 'allow' || call.name !== 'execute_sql') return decision;
   const sql = String(call.arguments?.query || '').trim();
   if (reviewed.has(sql) || /STR_TO_DATE|DATE_FORMAT/i.test(sql)) return decision;
   const head = sql.match(/^UPDATE\s+(`(?:``|[^`])+`|[A-Za-z_]\w*)\s+SET\s+(`(?:``|[^`])+`|[A-Za-z_]\w*)\s*=\s*/i);
   if (!head) return decision;
   const body = sql.slice(head[0].length).replace(/;\s*$/, '');
   let quote = '', depth = 0, where = -1, multiple = false;
   for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (quote) {
     if (char === '\\' && quote !== '`') { i++; continue; }
     if (char === quote) { if (body[i+1] === quote) i++; else quote = ''; }
     continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (depth === 0 && char === ',') { multiple = true; break; }
    if (depth === 0 && /^\sWHERE\b/i.test(body.slice(i))) { where = i; break; }
   }
   if (multiple || quote || depth !== 0) return decision;
   const expression = (where < 0 ? body : body.slice(0,where)).trim();
   if (!/^(?:CASE\b|CONCAT\s*\()/i.test(expression) || !/SUBSTRING\s*\(/i.test(expression)) return decision;
   const match = [sql,head[1],head[2],expression,where < 0 ? '' : body.slice(where).replace(/^\s+WHERE\s+/i,'')];
   const table = match[1].replace(/^`|`$/g,'').replace(/``/g,'`');
   if (table.toLowerCase() !== String(tc.table.table_name).toLowerCase()) return decision;
   const field = match[2].replace(/^`|`$/g,'').replace(/``/g,'`');
   const format = fields.get(field.toLowerCase());
   if (!format) return decision;
   const quoted = '`' + field.replace(/`/g,'``') + '`';
   const conversion = "DATE_FORMAT(STR_TO_DATE(" + quoted + ", '" + format.format + "'), '%Y-%m-%d')";
   const condition = quoted + " REGEXP '" + format.pattern + "'";
   const previous = (match[4] || '').replace(/;\s*$/,'').trim();
   const corrected = 'UPDATE ' + match[1] + ' SET ' + quoted + ' = ' + conversion + ' WHERE ' + (previous ? '(' + previous + ') AND ' : '') + condition + ';';
   reviewed.add(sql);
   const reason = 'Date conversion review: this UPDATE has not executed. The requested YYYY-MM-DD output requires the complete four-digit year and zero-padded month/day. The public storage format is ' + format.format + '; fixed SUBSTRING offsets across variable day/month lengths do not implement that conversion. Parse the original date then format it. Existing ISO dates must remain unchanged. A draft preserving your existing WHERE and limiting changes to the observed word-month format is execute_sql arguments ' + JSON.stringify({query:corrected}) + '. Check current format if needed, then call the tool with the corrected query. Initial examples show format only, not current matching rows. No statement has executed or been recorded as a successful write; this exact SQL is paused only once.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
