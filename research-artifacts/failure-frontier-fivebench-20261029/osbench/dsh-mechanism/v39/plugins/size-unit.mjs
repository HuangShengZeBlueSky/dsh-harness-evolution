export const name = 'size-unit';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    let corrected = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || corrected) return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message').flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text).find(t => t.includes('My problem is:')) || '';
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (!/disk usage|disk space/i.test(task) || !/\bdu\s+-[A-Za-z]*h/.test(args?.script || '') || !/\bawk\b.*sum/.test(args?.script || '')) return decision;
      corrected = true;
      let reason = 'du -h produces mixed K/M/G strings: adding their numeric prefixes loses units, and the sum is not bytes. For disk usage, select the requested files, run du -B1 on them and sum its numeric first column, then format the final total once with numfmt --to=iec. Keep all date filters. If subdirectories must be excluded use find ROOT -maxdepth 1 -type f. Do not substitute apparent file length for allocated disk usage.';
      if (/subdirectories/i.test(task) && !/exclud[^.]*subdirectories/i.test(task)) reason += ' This request INCLUDES subdirectories. A ROOT/*.log glob only selects direct children. Use find on the requested root recursively with the requested extension, then du -B1 for each selected file, sum the numeric first column, and format once. Do not limit the selection with maxdepth 1.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
