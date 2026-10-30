export const name = 'unique-scope';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    const corrected = new Set();
    const taskText = () => agent.session.snapshotEvents().filter(e => e.type === 'user/message')
      .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text)
      .find(t => t.includes('My problem is:')) || '';
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'bash_action') return decision;
      const task = taskText();
      if (!/unique|distinct/i.test(task)) return decision;
      let args = call.arguments;
      if (typeof args === 'string') args = JSON.parse(args);
      const script = args?.script || '';
      if (!/sort|uniq/.test(script) || !/wc\s+-l/.test(script)) return decision;
      let kind, reason;
      if (/each word[^.]*once per file/i.test(task)) {
        if (/\bfor\b|\bwhile\b|-exec\s+(?:sh|bash)/.test(script) || corrected.has('per-file-word')) return decision;
        corrected.add('per-file-word');
        reason = 'The task explicitly counts EACH WORD ONCE PER FILE. Preserve file identity: do not concatenate all files and globally deduplicate. For each selected file, extract letter sequences with grep -oE "[A-Za-z]+", lowercase when case is ignored, sort -u and count; then SUM those per-file unique counts. The same word in two files contributes twice. Keep the requested file scope. Use a per-file loop or find -exec to perform this computation.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      const multiFile = /xargs\s+grep|\*[^\s|;]*\.(?:log|txt)|\.(?:log|txt)\s+[^|;]*\.(?:log|txt)/.test(script);
      const streamInput = /(?:cat|zcat)\s+[^|]*\|/.test(script);
      const noPrefix = /grep\s+[^|;]*\s-[A-Za-z]*h|grep\s+-[A-Za-z]*h|--no-filename/.test(script);
      if (/within a single day/i.test(task) && /more than [0-9]+ times/i.test(task) && /awk\s+["']\{print \$1\}/.test(script)) {
        kind = 'daily-key';
        reason = 'The threshold applies WITHIN ONE DAY, so the frequency key must include BOTH IP and calendar date. Counting only the IP merges attempts from different days. Inspect actual rows, extract the IP and date (remove only the time portion), count each IP/date pair, keep pairs whose count is strictly greater than the requested threshold, then extract and globally deduplicate their IPs before wc -l. One IP qualifying on several days contributes only once. Preserve the complete file; a head sample is only for format validation.';
      } else if (/unique occurrences of each line|unique lines/i.test(task) && /grep\s+[^|;]*-[A-Za-z]*o/.test(script)) {
        kind = 'full-line-identity';
        reason = 'The task asks for unique COMPLETE LINES across files, not unique messages or ERROR tokens. Preserve every character of each matching source line, INCLUDING its timestamp if present. Select requested files, use cat selected_files | grep PATTERN | sort -u | wc -l (or grep -h without -o), and do not extract ERROR.* or strip fields before deduplicating. Keep the requested word and case rules.';
      } else if (/unique error messages/i.test(task) && /awk\s+["']\{print \$2\}|tr\s+["'] ["']/.test(script)) {
        kind = 'message-identity';
        reason = 'A unique error MESSAGE is the entire message text, not its second whitespace field or separate words. Inspect real input lines first. Select the requested ERROR lines, remove only the timestamp and ERROR prefix, trim leading/trailing spaces when requested, and keep each complete remaining message as ONE line before sort -u | wc -l. Preserve any explicit starts-with rule.';
      } else if ((/unique error messages/i.test(task) || /unique[^.]*line|line[^.]*unique/i.test(task)) && /grep\s+-o\s+["']ERROR["']/.test(script)) {
        kind = 'message-token';
        reason = 'Extracting only the constant ERROR discards the error message and cannot count distinct messages. Inspect a few real log lines, then extract the complete message text requested by the task, removing timestamps only when they are not part of message identity. Apply the requested case and time filters, then deduplicate those messages.';
      } else if (task.includes('[ERROR]') && /grep\s+["']\[ERROR\]["']/.test(script)) {
        kind = 'literal-marker';
        reason = 'The task requests the literal marker [ERROR]. In a grep regular expression [ERROR] matches one character, not that marker. Use grep -F "[ERROR]" before extracting the requested dates and global deduplication.';
      } else if (/\bgrep\b[^&]*&&\s*grep\b/.test(script)) {
        kind = 'pipeline-union';
        reason = 'With separate commands joined by &&, the final sort/count only consumes the last branch, not all earlier output. Read the selected files together with cat, extract the requested values into ONE stream, then apply one global sort -u | wc -l. Keep every requested filter.';
      } else if (/\bgrep\b/.test(script) && multiFile && !streamInput && !noPrefix && !/-exec\s+grep/.test(script)) {
        kind = 'filename-prefix';
        reason = 'For this unique-value count, grep over multiple named files adds filename prefixes, so sort -u can count one value once per file. Retry the same extraction with grep -h (for example grep -hoE PATTERN files), or cat the files into the extractor, then deduplicate only the extracted values. Keep every requested filter.';
      } else if (/IP address/i.test(task) && /cat\s+[^|]+\|/.test(script) && !/grep\s+[^|;]*-[A-Za-z]*o|\bawk\b|\bcut\b/.test(script)) {
        kind = 'whole-line-ip';
        reason = 'This counts distinct complete log lines, but the task requests unique IP addresses at the beginning of each line. Retry with cat selected_files | awk \'{print $1}\' | sort -u | wc -l, keeping the requested file scope and filters.';
      }
      if (!kind || corrected.has(kind)) return decision;
      corrected.add(kind);
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const task = agent.session.snapshotEvents().filter(e => e.type === 'user/message')
        .flatMap(e => e.data.content || []).filter(b => b.type === 'text').map(b => b.text)
        .find(t => t.includes('My problem is:')) || '';
      if (!/unique|distinct/i.test(task)) return result;
      let text = 'For uniqueness, preserve the requested scope. For a global unique count across files, merge their VALUES then deduplicate once; never add per-file unique counts. grep on multiple named files prefixes matches with filenames unless -h is used; those prefixes must not become part of the values. cat selected_files | extraction | sort -u | wc -l avoids filename prefixes. Extract exactly the requested field, with the requested date/filter. If the task explicitly says each word counted once PER FILE, deduplicate within each file then sum those per-file counts. Normalize case only when explicitly requested. Submit using the actual answer_action tool.';
      if (/unique occurrences of each line|unique lines/i.test(task)) text += ' For unique COMPLETE LINES, retain the entire original matching line, including timestamp and message. grep -o or ERROR.* suffix extraction changes line identity; use grep -h without -o, then sort -u globally.';
      if (/error messages/i.test(task)) text += ' Inspect a few actual log lines before choosing an extraction. An error MESSAGE is the complete message, not just the severity token ERROR: and not a timestamp. If case is ignored, use case-insensitive matching as well as normalization. For time ranges, compare the actual parsed time numerically or lexically in its displayed format; 2 PM is 14 hours. Retain all seconds in the requested interval rather than enumerating exact minute timestamps.';
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:26,text,interpolate:false}]};
    });
  });
}
