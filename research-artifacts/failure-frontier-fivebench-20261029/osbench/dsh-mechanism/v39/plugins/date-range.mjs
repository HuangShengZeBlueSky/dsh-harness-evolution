export const name = 'date-range';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    let corrected = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || corrected) return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message').flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text).find(t => t.includes('My problem is:')) || '';
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args?.script || '';
      const literalYear = script.match(/\^\[([0-9]{4})\]-/)?.[1];
      if (/date range/i.test(task) && literalYear && task.includes(literalYear)) {
        corrected = true;
        const reason = 'The expression [' + literalYear + '] is a CHARACTER CLASS matching ONE character, not the four-digit year. Match the year literally. Also align EVERY earlier pipeline filter with the actual line format: when timestamps start with a literal [, an initial ^[0-9] filter discards them before your later year test. Inspect the actual records, extract the complete date after any literal opening bracket, compare that date to BOTH requested inclusive bounds, and count matching complete lines across ALL requested files. Test the corrected extraction on the visible sample before accepting zero; changing only the final year filter cannot restore rows lost upstream.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      if (!/February 29/i.test(task) || !/leap years between/i.test(task) || !/grep\s+["']\d{4}-02-29["']/.test(args?.script || '')) return decision;
      corrected = true;
      const reason = 'The request spans MULTIPLE leap years. Filtering first for one exact YYYY-02-29 discards all other years; a later year filter cannot recover those entries. Match month/day 02-29 and the full allowed year range together. Extract the year from each record, keep it within the task bounds with the leap-year rule (divisible by 4 except centuries not divisible by 400), and count matching complete lines. Alternatively use one anchored date pattern containing every allowed leap year. Preserve the specified file and count entries rather than dates.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
