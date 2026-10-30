export const name = 'shell-recovery';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, getRawBusinessResult} = payload;
    let lastError = '', hint = '', blocked = false;
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'bash_action') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw) return decision;
      const line = String(raw.content).split('\n').find(l => /^\s*(find|grep|ls|cat|head|tail|bash|sh|awk|sed|wc):/i.test(l) && /No such file or directory|Is a directory|syntax error|unexpected EOF|command not found|: not found/i.test(l));
      if (!line) { lastError = ''; hint = ''; return decision; }
      lastError = line.trim();
      if (/Is a directory/i.test(line)) {
        hint = 'The command tried to read a directory as a file. Select the actual files inside the requested directory, then rerun the calculation; this output is not evidence of zero matching lines.';
      } else if (/No such file or directory/i.test(line)) {
        hint = 'This is a path/glob error, not evidence of zero matches or missing task data. Inspect the exact requested directory. Home means ~/ or $HOME; do not escape the tilde or replace it with relative home/. Select actual files, e.g. *.log rather than .log, and rerun the calculation.';
      } else if (/syntax error|unexpected EOF/i.test(line)) {
        hint = 'The intended shell command did not execute correctly because of syntax or quoting. Simplify the command and correct the quoting, then rerun it. Do not use its empty or zero output as the task answer.';
      } else {
        hint = 'A helper command is unavailable. Use an available alternative; for arithmetic, shell $((...)) or awk can sum the observed numbers. A missing helper does not establish a count of zero.';
      }
      const annotation = 'Observed command error: ' + lastError + '\n' + hint;
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || blocked || !lastError) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (call.name !== 'finish_action' && !(call.name === 'answer_action' && String(args.answer).trim() === '0')) return decision;
      blocked = true;
      const reason = 'The last calculation still has an unresolved command error: ' + lastError + '\n' + hint + ' Correct it before concluding zero or abandoning the task. This correction is requested once.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
