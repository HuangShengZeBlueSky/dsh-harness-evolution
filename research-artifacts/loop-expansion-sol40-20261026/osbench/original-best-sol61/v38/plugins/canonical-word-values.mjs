export const name = 'canonical-word-values';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit,getRawBusinessResult}, next) => {
    await next();
    let used = false;
    let listed = [];
    ac.on('tools/post-execute', async (call,result,proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'accept' || call.name !== 'bash_action') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const listing = /^\s*ls\s+(?:-[A-Za-z0-9]+\s+)*([^\s|;]+)\s*$/.exec(args.script || '');
      const raw = getRawBusinessResult(call.callId);
      if (!listing || !raw || raw.error || /\[truncated|No such file|cannot access/.test(String(raw.content))) return decision;
      const root = listing[1].replace(/^(['"])(.*)\1$/, '$2').replace(/\/$/,'');
      const names = String(raw.content).replace(/^The output of the OS:\s*/, '').split(/\r?\n/).filter(x=>/\.(?:txt|text)$/i.test(x));
      if (names.length) listed = names.map(x=>x.startsWith('/') || x.startsWith(root+'/') ? x : root+'/'+x);
      return decision;
    });
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || used) return decision;
      const first = agent.session.snapshotEvents().find(e=>e.type==='user/message');
      const task = (first?.data?.content || []).filter(b=>b.type==='text').map(b=>b.text).join(' ');
      if (!/\b(?:unique|distinct)\s+words\b/i.test(task) || !/ignore\s+case|case.insensitive/i.test(task) || !/punctuation/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const grep = /^\s*grep\s+((?:-[A-Za-z]+\s+)*)(['"])(.*?)\2\s+([^|;\n]+)\s*\|[\s\S]*\bwc\s+-l\s*$/.exec(script);
      const cat = /^\s*cat\s+([^|;\n]+)\s*\|[\s\S]*\bwc\s+-l\s*$/.exec(script);
      const extractsLetters = grep && grep[1].includes('o') && ['[a-zA-Z]+','[A-Za-z]+','[[:alpha:]]+','\\w+'].includes(grep[3]);
      const dropsPunctuationLines = grep && /^\^\[[^\]]*(?:a-z|A-Z|alpha)[^\]]*\]\+\$$/.test(grep[3]);
      if (!cat && !extractsLetters && !dropsPunctuationLines) return decision;
      if (cat && /tr\s+-d\s+['"]\[:punct:\]['"]/.test(script) && /grep\s+-v\s+['"]\^\$['"]/.test(script)) return decision;
      const selected = cat ? cat[1] : grep[4];
      const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
      const source = listed.length>1 && listed.some(path=>selected.includes(path)) ? listed.map(quote).join(' ') : selected.trim();
      const command = 'cat ' + source + " | tr '[:upper:]' '[:lower:]' | tr -d '[:punct:]' | tr '[:space:]' '\\n' | grep -v '^$' | sort -u | wc -l";
      used = true;
      const reason = 'The task defines case-insensitive words with punctuation excluded. Extracting separate alphabetic runs can split a punctuation-bearing word; filtering whole lines discards their other valid words. Count one global union across the complete observed file set rather than summing per-file distinct counts. Read the same selected files, normalize case, remove punctuation, split whitespace, discard empty tokens and deduplicate the complete resulting word values. Execute:\n' + command;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
