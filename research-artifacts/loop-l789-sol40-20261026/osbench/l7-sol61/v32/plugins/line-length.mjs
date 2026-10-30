export const name = 'line-length';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getVisibleInput} = payload;
    let task = '', corrected = false;
    function relevant() {
      if (!task) {
        const initial = (getVisibleInput().messages || []).find(m => m.role === 'user' && typeof m.content === 'string' && !/No tool call detected/i.test(m.content));
        if (initial) task = initial.content;
        else {
          const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
          if (first) task = (first.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        }
      }
      return /longest\s+line|max(?:imum)?\s+(?:line\s+length|length\s+of\s+(?:a\s+)?line)/i.test(task);
    }
    function advice() {
      return 'For the longest line, measure the character length of each complete input line, including its spaces and punctuation, across all selected files. Run one awk over the selected file arguments: awk \'length($0)>m {m=length($0)} END {print m+0}\'. $0 is the whole line. Keep the original file selection and compute one global maximum. wc -l counts lines; length($i) and for line in $content measure whitespace-separated words instead. Submit the observed integer length with answer_action.';
    }
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      if (!relevant()) return result;
      const text = advice();
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:32,text,interpolate:false}]};
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || corrected || call.name !== 'bash_action' || !relevant()) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const wholeLine = /length\s*\(\s*\$0\s*\)/.test(script);
      if (wholeLine || !/length\s*\(\s*\$(?:[1-9]|i\b)|for\s+(?:line|word)\s+in\s+\$/.test(script)) return decision;
      corrected = true;
      const reason = 'This command splits input lines into words, losing spaces and complete-line identity. ' + advice() + ' This correction is requested once.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
