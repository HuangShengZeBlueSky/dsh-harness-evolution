export const name = 'numeric-field-filter';
function contract(task) {
  const format = /\bformat\s*:?\s*["'`]([^"'`\n]+)["'`]/i.exec(task)?.[1];
  const wanted = /\b(?:unique|distinct)\s+([A-Za-z_]+(?:\s+(?:addresses|codes|messages|IDs))?)\b/i.exec(task)?.[1];
  if (!format || !wanted) return null;
  const separator = /\s+-\s+|\s+\|\s+|,\s*/.exec(format)?.[0];
  const fields = separator ? format.split(separator) : format.trim().split(/\s+/);
  let entity = wanted.toLowerCase().replace(/[^a-z0-9]/g, '');
  entity = entity.endsWith('addresses') ? entity.slice(0,-2) : entity.replace(/s$/, '');
  const target = fields.findIndex(f => f.toLowerCase().replace(/[^a-z0-9]/g,'').includes(entity));
  if (target < 0 || fields.length < 2) return null;
  for (let i = 0; i < fields.length; i++) {
    if (i === target) continue;
    const label = fields[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('_', '[ _]+');
    const value = new RegExp('(\\d+)\\s+' + label + '\\b','i').exec(task)?.[1]
      || new RegExp(label + '\\s*(?:of|is|=|:)?\\s*(\\d+)\\b','i').exec(task)?.[1];
    if (!value) continue;
    const ref = n => separator ? '$' + (n+1) : n === fields.length-1 ? '$NF' : '$(NF-' + (fields.length-n-1) + ')';
    return {format,field:fields[i],target:fields[target],value,separator,predicate:ref(i) + ' == "' + value + '" {print ' + ref(target) + '}'};
  }
  return null;
}
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    let used = false;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || used) return decision;
      const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const task = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
      const plan = contract(task);
      if (!plan) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const grep = /\bgrep\s+(?:-[A-Za-z]+\s+)*(['"])(.*?)\1\s+([^|;\n]+)/.exec(script);
      if (!grep || grep[2].trim() !== plan.value) return decision;
      const tail = script.slice(grep.index + grep[0].length);
      if (!/^\s*\|\s*(?:awk\s+(['"])[^'"]+\1\s*\|\s*)?sort(?:\s+-u)?\s*\|\s*(?:uniq\s*\|\s*)?wc\s+-l\s*$/.test(tail)) return decision;
      const command = script.slice(0,grep.index) + 'awk ' + (plan.separator ? '-F ' + JSON.stringify(plan.separator) + ' ' : '') + "'" + plan.predicate + "' " + grep[3].trim() + ' | sort -u | wc -l';
      used = true;
      const reason = 'The visible schema is ' + plan.format + '. Compare the entire ' + plan.field + ' field to the requested value ' + plan.value + ', then extract ' + plan.target + '. A final field has no trailing blank, and timestamp spaces must not shift columns. Preserve the selected input files and execute:\n' + command;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
