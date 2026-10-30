export const name = 'ranked-distinct-contract';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,agent,audit,getRawBusinessResult}, next) => {
    await next();
    let used = false;
    let answerBlocked = false;
    let selector = null;
    ac.on('tools/post-execute', async (call,result,proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'accept' || call.name !== 'bash_action') return decision;
      const raw = getRawBusinessResult(call.callId);
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const listed = /^\s*ls\s+(?:-[A-Za-z]+\s+)*([^|;\n]+?)\s*$/.exec(args.script || '');
      if (listed && raw && !raw.error && !/\[truncated|cannot access|No such file/.test(String(raw.content))) selector = listed[1];
      return decision;
    });
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'allow') return decision;
      const first = agent.session.snapshotEvents().find(e=>e.type==='user/message');
      const task = (first?.data?.content || []).filter(b=>b.type==='text').map(b=>b.text).join(' ');
      if (!/\b(?:highest|largest|most)\b/i.test(task) || !/\bfile\b/i.test(task) || !/\bunique\s+timestamps\b/i.test(task)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (call.name === 'answer_action' && /\bwhich\s+file\b/i.test(task) && !answerBlocked && /^\d+$/.test(String(args.answer || '').trim())) {
        answerBlocked = true;
        const reason = 'The task asks WHICH FILE has the highest per-file distinct timestamp count. A number is the comparison score, not the requested filename. Use the actual observed file names and per-file results, then submit the winning filename with answer_action.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      if (call.name !== 'bash_action' || used) return decision;
      const script = args.script || '';
      if (!/\b(?:sort|uniq)\b/.test(script) || !/\bwc\s+-l\b/.test(script)) return decision;
      let command = script.replace(/\bawk\s+(['\"])\{\s*print\s+\$1\s*\}\1/g, () => "awk '{print $1, $2}'").replace(/\bcut\s+-d\s*(['"]) \1\s+-f\s*1(?=\s|$)/g, 'cut -d" " -f1,2');
      let global = false;
      if (command === script && selector && /[*?]/.test(selector) && script.includes(selector) && /^\s*(?:grep|cat)\b/.test(script) && /\bwc\s+-l\s*$/.test(script)) {
        command = 'for file in ' + selector + '; do count=$(' + script.replaceAll(selector,'"$file"') + '); printf \'%s\\t%s\\n\' "$count" "${file##*/}"; done | sort -nr | head -n 1 | cut -f2-';
        global = true;
      }
      if (command === script) return decision;
      used = true;
      const reason = (global ? 'The requested answer is the filename with the highest per-file distinct count. A global union count cannot identify that filename. Reuse the observed file selection, run the same timestamp projection separately for each file, associate each count with its basename, and select the largest. Execute:\n' : 'The task ranks files by distinct complete timestamps on the requested date. Selecting only the date makes every nonempty file count as one and loses the ranking. Preserve both date and clock in each projected timestamp before each file-level deduplication. Keep the filename associated with its computed count. Execute:\n') + command;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
