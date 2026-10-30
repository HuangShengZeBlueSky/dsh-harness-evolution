export const name = 'numeric-id-max';

export function apply(ctx) {
  ctx.on('benchmark/setup', async (p, next) => {
    await next();
    const warned = new Set();
    p.ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const query = args?.query || '';
      const match = query.match(/^\s*SELECT\s+MAX\s*\(\s*(`(?:``|[^`])+`|[\w.]+)\s*\)\s*(?:AS\s+\w+)?\s+FROM\s+([\s\S]+?)\s*;?\s*$/i);
      if (!match) return decision;
      const raw = p.getRawBusinessResult(call.callId);
      if (!raw || raw.error || result.isError || !/^\s*\[\(\s*['"]/.test(String(raw.content))) return decision;
      const first = p.agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const initial = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const question = initial.split('Question:').slice(1).join('Question:');
      if (!/\b(?:next|unique)\b/i.test(question)) return decision;
      const field = match[1].startsWith('`') ? match[1] : '`' + match[1] + '`';
      if (warned.has(field)) return decision;
      const scope = match[2].replace(/;\s*$/, '').trim();
      if (/\b(?:GROUP\s+BY|ORDER\s+BY|LIMIT|UNION)\b/i.test(scope)) return decision;
      const numericQuery = 'SELECT MAX(CAST(' + field + ' AS UNSIGNED)) AS max_numeric_id FROM ' + scope + (/\bWHERE\b/i.test(scope) ? ' AND ' : ' WHERE ') + field + " REGEXP '^[0-9]+$';";
      warned.add(field);
      const annotation = '\nNumeric identifier receipt: MAX just returned a string. Text MAX uses character order, so it may select 9 above 68 or a summary label above real identifiers. To determine the next unique numeric identifier, first call execute_sql with:\n' + numericQuery + '\nThis preserves the query scope and excludes nonnumeric summary rows. Use the actual numeric maximum returned by that query, increment it exactly once, then store the new identifier as a string. For several new rows, assign consecutive distinct identifiers. Continue the requested INSERT after obtaining the maximum.';
      p.audit({method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation});
      return {...decision, content: [...(decision.content || result.content), {type: 'text', text: annotation}]};
    });
  });
}
