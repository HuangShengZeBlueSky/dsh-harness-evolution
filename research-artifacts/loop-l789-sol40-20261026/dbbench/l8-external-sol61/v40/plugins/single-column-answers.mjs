export const name = 'single-column-answers';
const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const atom = String.raw`(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[+-]?(?:\d+(?:\.\d*)?|\.\d+))`;
const row = String.raw`\(\s*(${atom})\s*,\s*\)`;
const complete = new RegExp(String.raw`^\[\s*${row}(?:\s*,\s*${row})*\s*\]$`, 's');
function decode(token) {
 if (token[0] !== "'" && token[0] !== '"') return token;
 const escapes = {n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',a:'\x07'};
 let value = '';
 for (let i=1;i<token.length-1;i++) {
  const ch = token[i];
  if (ch !== '\\') { value += ch; continue; }
  const escaped = token[++i];
  if (escaped === '\\' || escaped === "'" || escaped === '"') value += escaped;
  else if (Object.hasOwn(escapes,escaped)) value += escapes[escaped];
  else if (escaped === 'x' || escaped === 'u' || escaped === 'U') {
   const length = escaped === 'x' ? 2 : escaped === 'u' ? 4 : 8;
   const hex = token.slice(i+1,i+1+length);
   if (hex.length !== length || !/^[0-9a-f]+$/i.test(hex)) return;
   value += String.fromCodePoint(parseInt(hex,16));
   i += length;
  } else return;
 }
 return value;
}
export function apply(ctx) {
 ctx.on('benchmark/setup', async (p, next) => {
  await next();
  if (/INSERT|UPDATE|DELETE/i.test(String(p.taskContext?.type || ''))) return;
  p.ac.on('tools/post-execute', async (call, result, next) => {
   const decision = await next();
   if (decision.kind !== 'accept' || call.name !== 'execute_sql' || !/^\s*SELECT\b/i.test(call.arguments?.query || '')) return decision;
   const raw = p.getRawBusinessResult(call.callId);
   if (!raw || raw.error || result.isError) return decision;
   const receipt = String(raw.content || '').trim();
   if (!complete.test(receipt)) return decision;
   const answers = [...receipt.matchAll(new RegExp(row,'gs'))].map(match => decode(match[1]));
   if (answers.some(v => v === undefined)) return decision;
   const numbers = answers.filter(v => numeric.test(v));
   const repeatedNumbers = new Set(numbers).size < numbers.length;
   const decorated = answers.some(v => /\([^)]*\)|[−–—]/u.test(v));
   if (!repeatedNumbers && !decorated) return decision;
   const annotation = 'Single-column answer preservation: the actual query returned ' + answers.length + ' row(s). '
    + 'If this projection directly answers the question, these submission arguments preserve the returned field values and row multiplicity: ' + JSON.stringify({answers})
    + '. Keep repeated numeric rows as separate entries; do not collapse them to one value or replace them by a row count. Preserve text inside the field, including parenthesized annotations, punctuation, spaces, Unicode minus and dash characters. Only SQL tuple wrappers have been removed here. If the query was diagnostic or the question requires a further calculation, complete that work instead of submitting these intermediate values. Use the actual commit_final_answer function with the answers object.';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
  });
 });
}
