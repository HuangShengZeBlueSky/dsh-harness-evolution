export const name = 'sql-recovery';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (p, next) => {
    await next();
    p.ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'execute_sql') return decision;
      const content = String(p.getRawBusinessResult(call.callId)?.content || '');
      if (!/^(1064|1054|1146)\s*\(/.test(content.trim())) return decision;
      const first = p.agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const initial = (first?.data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const table = initial.match(/The name of this table is (.*?), and the headers/i)?.[1];
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const query = args.query || '';
      let annotation = '\nSQL recovery: this statement returned an SQL error. Correct the failing statement and retry the requested operation. MySQL table and column identifiers use backticks, not double quotes. Preserve spaces and punctuation; do not rename identifiers with underscores. ';
      if (table) annotation += 'The exact task table reference is `' + table + '`. ';
      annotation += 'If a column is unknown, use DESCRIBE on that exact table and copy the actual returned column name. An apostrophe inside a string value must be escaped, for example by doubling it; keep the stored value unchanged. ';
      if (/\bRank\b/i.test(query)) annotation += 'Rank is a reserved identifier: write `Rank` everywhere it is a column. ';
      if (query.includes('#')) annotation += 'A # outside a quoted identifier starts a comment: quote the complete column name containing # in backticks. ';
      if (initial.includes('\u00a0') || /\\xa0/.test(content)) annotation += 'Preserve non-breaking spaces in column names. JSON can encode the character as \\u00a0; do not put literal \\xa0 text in the SQL identifier. ';
      p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
}
