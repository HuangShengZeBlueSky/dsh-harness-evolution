export const name = 'numeric-value-extrema';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (p, next) => {
    await next();
    const warned = new Set();
    p.ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const match = (args?.query || '').match(/^\s*SELECT\s+(MAX|MIN)\s*\(\s*(`(?:``|[^`])+`|[\w.]+)\s*\)\s*(?:AS\s+\w+)?\s+FROM\s+([\s\S]+?)\s*;?\s*$/i);
      if (!match || !/attendance|crowd|population|earnings|points|score|laps|wins|loss|height|weight|distance|total|count|amount|number|capacity|value|credits/i.test(match[2])) return decision;
      const raw = p.getRawBusinessResult(call.callId);
      if (!raw || raw.error || result.isError || !/^\s*\[\(\s*['"][+\-]?[0-9][0-9,.]*['"]/.test(String(raw.content))) return decision;
      const first = p.agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const initial = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      if (/\b(?:next|unique)\b/i.test(initial.split('Question:').slice(1).join('Question:'))) return decision;
      const field = match[2].startsWith('`') ? match[2] : '`' + match[2] + '`';
      const scope = match[3].replace(/;\s*$/, '').trim();
      if (warned.has(field) || /\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|UNION)\b/i.test(scope)) return decision;
      warned.add(field);
      const direction = match[1].toUpperCase() === 'MAX' ? 'DESC' : 'ASC';
      const query = 'SELECT raw_value FROM (SELECT ' + field + ' AS raw_value FROM ' + scope + ") AS numeric_values WHERE REPLACE(raw_value, ',', '') REGEXP '^[+-]?[0-9]+([.][0-9]+)?$' ORDER BY CAST(REPLACE(raw_value, ',', '') AS DECIMAL(30,8)) " + direction + ' LIMIT 1;';
      const annotation = '\nNumeric quantity receipt: this ' + match[1].toUpperCase() + ' returned text. Text extrema use character order, which differs from numeric order for different digit lengths or thousands commas. Check the actual numeric extremum with execute_sql:\n' + query + '\nThis keeps the original query filter and returns the original stored string. Use that returned raw_value as the answer, preserving commas and decimals. Do not submit a reformatted numeric cast or alter any database values.';
      p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
}
