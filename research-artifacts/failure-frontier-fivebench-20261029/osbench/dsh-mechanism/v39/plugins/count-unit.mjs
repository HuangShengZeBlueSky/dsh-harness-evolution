export const name = 'count-unit';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit, getRawBusinessResult}, next) => {
    await next();
    let corrected = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action' || corrected) return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text)
        .find(t => t.includes('My problem is:')) || '';
      let fileArgs = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const fileScript = fileArgs?.script || '';
      if (/(?:how many|number of) files/i.test(task) && /contain/i.test(task) && !/number of lines|count.*lines/i.test(task) && /\bgrep\b/.test(fileScript) && /wc\s+-l/.test(fileScript) && !/grep\s+[^|;]*-[A-Za-z]*l\b|--files-with-matches/.test(fileScript)) {
        corrected = true;
        const reason = 'The requested unit is FILES containing a match at least once. grep output lines count matching lines, so a file with several matches is overcounted. Keep the requested file selection and matching flags, use grep -l (or grep -rl when recursion is requested) to emit matching file paths, deduplicate the paths, then wc -l. Do not replace a matching-line task with this file count.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      if (/unique|distinct|considering only files that contain/i.test(task) || !/lines/i.test(task) || !/contain|word/i.test(task)) return decision;
      let args = call.arguments;
      if (typeof args === 'string') args = JSON.parse(args);
      const script = args?.script || '';
      if (/grep\s+[^|;]*-[A-Za-z]*o\b/.test(script) && /wc\s+-l/.test(script)) {
        corrected = true;
        const reason = 'This task counts matching LINES, not each occurrence. grep -o can emit several matches for one line. Remove -o and count matching lines with grep -h PATTERN selected_files | wc -l. If the request says standalone word, use grep -w; preserve case-insensitive -i when requested, file scope and every filter. Rerun the count.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      if (!/grep\s+[^|;]*-[A-Za-z]*l\b/.test(script) || !/wc\s+-l/.test(script)) return decision;
      corrected = true;
      const reason = 'The requested unit is matching LINES. grep -l emits filenames; wc -l after it counts files or all lines in selected files. Retry the same file selection with grep -h PATTERN files | wc -l, or find selected_files -exec grep PATTERN {} \\; | wc -l. Preserve the requested case, word boundaries, extension and recursion.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text)
        .find(t => t.includes('My problem is:')) || '';
      if (/unique|distinct|considering only files that contain/i.test(task) || !/count|number/i.test(task) || !/lines/i.test(task) || !/contain|word/i.test(task)) return result;
      const text = 'For this request, count MATCHING LINES, not matching files or every line of files that contain a match. grep -l returns filenames; passing those to wc -l counts entire files. Instead use grep -h PATTERN selected_files | wc -l, or sum grep -c counts. Do not use grep -o when counting lines: one line may contain several occurrences. Preserve the requested file scope, recursion, case sensitivity, whole-word constraints (grep -w when requested), and time filters. Use the actual answer_action tool to submit the computed count.';
      audit({method_id:name, hook:'system-prompt/assemble', text});
      return {...result, sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'bash_action') return decision;
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text)
        .find(t => t.includes('My problem is:')) || '';
      if (/unique|distinct/i.test(task) || !/lines/i.test(task) || !/contain|word/i.test(task)) return decision;
      const raw = getRawBusinessResult(call.callId);
      if (typeof raw?.content !== 'string' || raw.content.split('\n').filter(l => /:\d+$/.test(l)).length < 2) return decision;
      const annotation = '\nThese are separate per-file counts, not a single total. Compute their sum with a shell command before submitting. For example rerun the same selection and grep -h -c pattern files | awk \'{n+=$1} END {print n+0}\'. Keep the original matching flags and scope.';
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
}
