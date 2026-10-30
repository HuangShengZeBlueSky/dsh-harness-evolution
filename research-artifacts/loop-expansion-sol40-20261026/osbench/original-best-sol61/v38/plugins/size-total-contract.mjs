export const name = 'size-total-contract';
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit}, next) => {
    await next();
    let used = false;
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || used) return decision;
      const first = agent.session.snapshotEvents().find(e=>e.type==='user/message');
      const task = (first?.data?.content || []).filter(b=>b.type==='text').map(b=>b.text).join(' ');
      if (!/\b(?:total size|disk space|total disk)\b/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const addsHuman = /\bdu\s+[^|]*-[A-Za-z]*h\b/.test(script) && /\b[A-Za-z_]\w*\s*\+=\s*\$1/.test(script);
      const rounds = /%\.\d+f/.test(script) && /1024/.test(script);
      const duFlags = /\bdu\s+((?:--?[A-Za-z0-9=-]+\s+)*)/.exec(script)?.[1] || '';
      const apparentSource = /--apparent-size|(?:^|\s)-[A-Za-z]*b[A-Za-z]*(?:\s|$)/.test(duFlags);
      const explicitDisk = /\bdisk space\b|\bspace consumed\b|\bdisk usage\b/i.test(task);
      const explicitApparent = /\b(?:apparent size|file length|logical size)\b/i.test(task);
      const allocated = explicitDisk || (!explicitApparent && /\bdu\b/.test(script) && !apparentSource);
      const wrongMetric = explicitDisk && apparentSource;
      if (!addsHuman && !rounds && !wrongMetric) return decision;
      let selection = null;
      const findDu = /^\s*(find[\s\S]+?)\s+-exec\s+du\s+(?:-[A-Za-z0-9]+\s+)+\{\}\s*(?:\\+;|\+)\s*\|\s*awk\b/.exec(script);
      const findPrintf = /^\s*(find[\s\S]+?)\s+-printf\s+(['"])%s\\+n\2\s*\|\s*awk\b/.exec(script);
      if (findDu || findPrintf) selection = (findDu || findPrintf)[1];
      else {
        const direct = /^\s*du\s+(?:-[A-Za-z0-9]+\s+)+(\S+)(?:\s+2>\/dev\/null)?\s*\|\s*awk\b/.exec(script);
        if (!direct) return decision;
        const path = direct[1].replace(/^(['"])(.*)\1$/, '$2');
        if (!path.startsWith('/') || !/[*?]/.test(path)) return decision;
        const slash = path.lastIndexOf('/');
        const root = path.slice(0,slash) || '/';
        const pattern = path.slice(slash+1);
        const recursive = /subdirector|recursiv/i.test(task);
        selection = 'find ' + quote(root) + (recursive ? '' : ' -maxdepth 1') + ' -type f -name ' + quote(pattern);
      }
      if (/-(?:exec|printf|delete|print)\b/.test(selection)) return decision;
      const bytes = allocated ? ' -exec du -B1 {} +' : " -printf '%s\\n'";
      const command = selection + bytes + " | awk '{s+=$1} END {print s+0}' | numfmt --to=iec";
      used = true;
      const reason = 'Preserve the requested file selection and aggregate integer ' + (allocated ? 'allocated bytes for disk-space consumption' : 'apparent bytes for file sizes') + ' before formatting once with the native IEC suffix style used by du -h. Do not append an extra B to that native size token. Adding du -h strings mixes units; fixed decimal MB formatting can turn small nonzero totals into zero. The command also respects explicitly requested subdirectories. Execute:\n' + command;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
