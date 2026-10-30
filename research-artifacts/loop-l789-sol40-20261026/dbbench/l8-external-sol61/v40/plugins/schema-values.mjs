export const name = 'schema-values';
export function apply(ctx) {
 ctx.on('benchmark/setup', async (p, next) => {
  await next();
  const tc = p.taskContext || {};
  const table = tc.table;
  let view = table;
  if (Array.isArray(table)) view = table.slice(0, 4);
  else if (table && typeof table === 'object') view = Object.fromEntries(Object.entries(table).map(([k,v]) => [k, Array.isArray(v) ? v.slice(0, 4) : v]));
  const text = 'SQL storage reference. Use MySQL backticks around every table and column identifier, including Rank. Copy the exact names; do not replace spaces with underscores.\n'
   + 'Public table information: ' + (tc.add_description || '') + '\n'
   + 'Public initial table sample (not current state after writes): ' + JSON.stringify(view) + '\n'
   + 'Preserve requested string values, punctuation, dash characters, commas, percent signs and date spacing. Match existing storage style when a value is described in words. Do not turn text dates into ISO dates or medals into numbers without checking stored values. Query the database for current facts.';
  p.ac.on('system-prompt/assemble', async (a,c,next) => {
   const r = await next();
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r, sections:[...r.sections,{name,order:25,text,interpolate:false}]};
  });
 });
}
