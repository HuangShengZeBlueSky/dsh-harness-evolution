export const name = 'literal-fidelity';
const normalized = text => text.replace(/[–—−]/g, '-').replace(/\s/g, '').toLowerCase();
const sqlString = text => "'" + text.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, taskContext} = payload;
    const description = taskContext?.description || '';
    const supplied = [...description.matchAll(/(?:^|[\s(:,=])(["'])([^\n]*?)\1/g)].map(m => m[2]);
    supplied.push(...(description.match(/\b\d+(?:[–—−-]\d+)+\b/g) || []));
    const values = new Map();
    for (const text of supplied) {
      const key = normalized(text);
      if (!key) continue;
      if (!values.has(key)) values.set(key, new Set());
      values.get(key).add(text);
    }
    let denied = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || denied || call.name !== 'execute_sql') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const query = args.query || '';
      const insertValues = /^\s*(?:INSERT|REPLACE)\b/i.test(query) && !/\b(?:CONCAT|REPLACE|REGEXP_REPLACE)\s*\(/i.test(query);
      const fixed = query.replace(/`(?:``|[^`])*`|'(?:''|\\.|[^'])*'/g, (token, index) => {
        if (token.startsWith('`')) return token;
        const before = query.slice(0, index);
        const direct = /[=<>]\s*$/.test(before);
        if (!direct && !(insertValues && /\bVALUES\b/i.test(before))) return token;
        const text = token.slice(1, -1).replace(/''/g, "'").replace(/\\([\\'])/g, '$1');
        const candidates = values.get(normalized(text));
        if (!candidates || candidates.has(text) || candidates.size !== 1) return token;
        return sqlString([...candidates][0]);
      });
      if (fixed === query) return decision;
      denied = true;
      const reason = 'Not executed. The task explicitly supplies these strings; preserve their exact spaces and dash characters. Retry with execute_sql using this SQL: ' + fixed;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
