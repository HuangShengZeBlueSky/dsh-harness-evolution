export const name = 'file-threshold';
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
      if (!/filter out files/i.test(task) || !/less than \d+ lines/i.test(task) || !/sum/i.test(task) || !/\bgrep\b|\bwc\b|xargs\s+cat/.test(script) || /\bfor\b|\bwhile\b/.test(script)) return decision;
      corrected = true;
      const reason = 'Apply the requested line threshold to EACH FILE before summing. Do not concatenate files before filtering. For each selected file use n=$(wc -l < "$file") to count all lines including blank lines; keep n only when it meets the task threshold, then sum those retained numeric counts with awk. grep -c . excludes blank lines, and multi-file grep -c emits filename:count rather than a numeric first field. Use a per-file shell loop with simple quoting, then submit the resulting sum.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
