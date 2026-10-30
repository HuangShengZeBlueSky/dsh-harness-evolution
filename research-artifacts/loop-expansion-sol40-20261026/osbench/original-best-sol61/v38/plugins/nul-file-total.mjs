export const name = 'nul-file-total';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    let used = false;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || used) return decision;
      const first = agent.session.snapshotEvents().find(e=>e.type==='user/message');
      const task = (first?.data?.content || []).filter(b=>b.type==='text').map(b=>b.text).join(' ');
      if (!/\btotal size\b|\bdisk space\b/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const wrapper = /^\s*du\s+((?:-[A-Za-z0-9]+\s+)+)--files0-from\s+<\(([\s\S]*)\)\s*$/.exec(script);
      if (!wrapper || !/^\s*find\b/.test(wrapper[2])) return decision;
      let producer = wrapper[2].replace(/\|\s*xargs\s+-0\s*$/, '').trim();
      let names = false;
      producer = producer.replace(/\bgrep\s+((?:-[A-Za-z]+\s+)*)/g, (whole, flags) => {
        if (!flags.includes('l')) return whole;
        names = true;
        return flags.includes('Z') ? whole : 'grep -Z ' + flags;
      });
      if (!names) return decision;
      const apparent = /(?:^|\s)-[A-Za-z]*b[A-Za-z]*(?:\s|$)/.test(wrapper[1]);
      const command = producer + ' | du ' + (apparent ? '-cb' : '-c -B1') + " --files0-from=- | tail -n 1 | awk '{print $1}' | numfmt --to=iec";
      used = true;
      const reason = 'The filename producer and du --files0-from must agree on NUL separators. grep -l emits newlines, while xargs -0 followed by its default echo does not create a NUL file list. Emit grep -lZ filenames directly, preserve the original size metric, and read the single aggregate total before formatting with native du-style IEC suffixes, without an added B. Execute:\n' + command;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
