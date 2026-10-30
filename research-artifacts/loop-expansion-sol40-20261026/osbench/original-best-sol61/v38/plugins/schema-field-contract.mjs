export const name = 'schema-field-contract';
function derive(task) {
  const format = /\bformat\s*:?\s*["'`]([^"'`\n]+)["'`]/i.exec(task)?.[1];
  const wanted = /\b(?:unique|distinct)\s+([A-Za-z_]+(?:\s+(?:addresses|codes|messages|IDs))?)\b/i.exec(task)?.[1];
  if (!format || !wanted) return null;
  const separator = /\s+-\s+|\s+\|\s+|,\s*/.exec(format)?.[0];
  const fields = separator ? format.split(separator) : format.trim().split(/\s+/);
  let entity = wanted.toLowerCase().replace(/[^a-z0-9]/g, '');
  entity = entity.endsWith('addresses') ? entity.slice(0, -2) : entity.replace(/s$/, '');
  const index = fields.findIndex(f => f.toLowerCase().replace(/[^a-z0-9]/g, '').includes(entity));
  if (fields.length < 2 || index < 0) return null;
  const right = fields.length - index - 1;
  const projection = separator
    ? 'awk -F ' + JSON.stringify(separator) + " '{print $" + (index + 1) + "}'"
    : "awk '{print " + (right ? '$(NF-' + right + ')' : '$NF') + "}'";
  return {format,field:fields[index],projection};
}
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    ac.on('system-prompt/assemble', async (assembly, context, proceed) => {
      const result = await proceed();
      const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const task = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ');
      const contract = derive(task);
      if (!contract) return result;
      const text = 'Data contract from the task: ' + contract.format + '. Count distinct ' + contract.field + ', not numeric fragments from other columns. Inspect a real line, then project only that field before deduplication across all selected files. Projection for this schema: ' + contract.projection + '. Apply requested filters to complete named fields; a field at end of line needs no trailing blank. Whitespace inside timestamps must not shift the chosen column.';
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:26,text,interpolate:false}]};
    });
  });
}
