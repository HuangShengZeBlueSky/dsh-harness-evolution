export const name = 'gzip-content';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getVisibleInput} = payload;
    let task = '', corrected = false;
    function relevant() {
      if (!task) {
        const first = (getVisibleInput().messages || []).find(m => m.role === 'user' && typeof m.content === 'string' && !/No tool call detected/i.test(m.content));
        if (first) task = first.content;
        else {
          const event = agent.session.snapshotEvents().find(e => e.type === 'user/message');
          if (event) task = (event.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        }
      }
      return /compressed|\.gz\b/i.test(task);
    }
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || corrected || call.name !== 'bash_action' || !relevant()) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const m = script.match(/^\s*grep\s+((?:-[A-Za-z]+\s+)*)("[^"\n]*"|'[^'\n]*')\s+([^|;\n]+)(\|[\s\S]*)?$/);
      if (!m || !/\.gz\b/.test(m[3])) return decision;
      corrected = true;
      const flags = m[1].trim().split(/\s+/).map(f => f.replace(/[rR]/g, '')).filter(f => f !== '-').join(' ');
      const suggested = 'gzip -cdf -- ' + m[3].trim() + ' | grep ' + (flags ? flags + ' ' : '') + m[2] + ' ' + (m[4] || '');
      const reason = 'This grep reads compressed gzip bytes directly, so it cannot reliably match the text inside .gz logs. Decode the selected files before applying the original content filter and aggregation. gzip -cdf writes decompressed text to stdout; with -f it also passes ordinary uncompressed logs through, allowing mixed .log and .gz inputs. Keep the original selected file paths and content conditions. Remove recursive grep flags after converting its input to a stream. Suggested pipeline:\n' + suggested + '\nUse its actual output and submit the result. This correction is requested once.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
