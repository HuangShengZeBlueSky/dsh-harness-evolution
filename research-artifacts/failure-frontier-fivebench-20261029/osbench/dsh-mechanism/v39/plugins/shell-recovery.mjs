export const name = 'shell-recovery';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit, getRawBusinessResult}, next) => {
    await next();
    let lastCd = null;
    let dialectCorrected = false, inspected = false, emptyAdvised = false, literalExtensionCorrected = false, mixedCorrected = false;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action') return decision;
      let args = call.arguments;
      if (typeof args === 'string') args = JSON.parse(args);
      const script = args?.script || '';
      const task = agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).find(t=>t.includes('My problem is:'))||'';
      if (!literalExtensionCorrected && /\.log/.test(task) && /files/i.test(task) && /\bgrep\b/.test(script) && /\/\.log(?:\s|["']|$)/.test(script)) {
        literalExtensionCorrected = true;
        const reason = 'The task requests a SET of files with the .log extension. The path ending in /.log selects one literal hidden filename, not that file set. Use its PARENT directory as the find search root and -type f -name "*.log" to select files, recursively when subdirectories are requested. Then count the requested matching CONTENT LINES using grep -h and wc -l. Preserve case sensitivity and use -w when a standalone word is requested. A failed literal-path lookup cannot establish a zero for the requested set.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      if (!mixedCorrected && /some files may be compressed|include those as well/i.test(task) && /\bzcat\b/.test(script) && !/zcat\s+(?:-[A-Za-z]*f|--force)/.test(script)) {
        mixedCorrected = true;
        const reason = 'The request includes BOTH plain .log and compressed .log.gz files. Plain zcat rejects ordinary logs, so that stream omits required content. Keep the selected file set and use zcat -f to read both formats into ONE stream, then apply the requested case-sensitive string filter and count matching lines. For example keep the find selection and pipe it to xargs zcat -f | grep PATTERN | wc -l. No shell conditional is needed. Rerun the complete selection before submitting.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      if (dialectCorrected) return decision;
      if (!/\bgrep\b/.test(script) || !/\\d/.test(script) || /grep\s+[^|;]*-[A-Za-z]*P|--perl-regexp/.test(script)) return decision;
      dialectCorrected = true;
      const reason = 'This grep pattern uses \\d, which does not mean a digit in ordinary grep or grep -E. Use grep -E with [0-9] and ERE quantifiers, or explicitly use grep -P when available. Preserve the task date, timestamp format, scope and output unit; rerun the corrected extraction before interpreting an empty result.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'bash_action') return decision;
      const raw = getRawBusinessResult(call.callId);
      const output = typeof raw?.content === 'string' ? raw.content : '';
      let args = call.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return decision; } }
      const script = args?.script || '';
      let annotation = '';
      const empty = /The output of the OS is empty\./.test(output) || /The output of the OS:\s*0\s*$/.test(output);
      if (!empty && !/No such file|cannot access|Is a directory|syntax error/.test(output) &&
          /\bhead\b|\bsed\s+-n|\bcat\b/.test(script) && !/\bgrep\b|\bwc\b|\bsort\b/.test(script)) inspected = true;
      if (/not in gzip format/.test(output)) {
        annotation = 'Some selected files were rejected as non-gzip, so the count omits their content. For a mixture of plain and compressed logs, use zcat -f on the selected files, or read plain files with cat and compressed files with zcat, combine the content, then apply the requested filter and count again.';
      } else if (/Invalid range|syntax error|runaway string constant|command not found/.test(output)) {
        annotation = 'The command has a syntax or regular-expression error; its trailing count is not a valid result. Change the failing expression rather than trimming its output. Use numeric comparisons for ranges or explicit alternatives in grep; bracket classes match one character. Pass shell values to awk with -v variable="$value" instead of embedding shell substitutions inside a quoted awk program. Rerun the repaired computation.';
      } else if (/Is a directory/.test(output)) {
        annotation = 'The input passed to grep is a directory, not a file. Select regular files INSIDE the task directory, using it as the find root, then count their matching content. Preserve the requested extension and recursion instead of treating the directory name as a filename filter.';
      } else if (/No such file or directory|cannot access/.test(output)) {
        const priorCd = lastCd;
        if (/\bcd\s/.test(script)) lastCd = null;
        annotation = 'This command reported an error. A trailing numeric pipeline output is not a valid task result until the failed input or pattern is repaired and the calculation rerun. For path errors, run pwd and inspect the directory using the visible task spelling. Bash working directory persists across calls; use an established absolute path or "$HOME" for home paths, not /home/$(whoami) or escaped tilde.';
        annotation += ' A failed wildcard does not mean its parent directory or home is missing. /root can be the real home directory: trust echo "$HOME". List the actual parent directory and change the failing filename pattern, rather than repeating it with a different home spelling.';
        const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message').flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text).find(t => t.includes('My problem is:')) || '';
        if (/\.log/.test(task) && /\/\.\*.*\.log/.test(script)) annotation += ' Your /.*.log pattern selects only hidden filenames. A .log EXTENSION normally uses *.log; find "$HOME" -maxdepth 1 -type f -name "*.log" also matches hidden files. Preserve requested recursion.';
        if (priorCd) annotation += ' Earlier a cd command ran without a reported error: ' + priorCd + '. You may already be inside that directory; check pwd before prepending its name again.';
      } else if (empty && /\bgrep\b/.test(script) && !inspected && !emptyAdvised) {
        emptyAdvised = true;
        annotation = 'The pipeline returned empty output or zero. Before concluding that the task data has no matches, verify the selected files and extraction once: list/find the actual requested directory, then inspect a few real input lines with head. Use the task directory as the search root, not as a -name file filter; do not assume an extension absent from the request. Check the pattern against that visible format, preserve all scope/filter requirements, and rerun. Zero can be valid once the selection and pattern are established.';
      } else if (/(?:^|[;&\n])\s*cd\s/.test(script)) {
        lastCd = script;
        annotation = 'Bash working directory persists across calls. This command included cd without a reported error; subsequent relative paths start from the resulting directory. Check pwd if uncertain; do not assume each call starts in home.';
      }
      if (!annotation) return decision;
      annotation = '\n' + annotation;
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
}
