export const name = 'clean-unique';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getVisibleInput} = payload;
    let task = '', corrected = false;
    function taskText() {
      if (!task) {
        const visible = getVisibleInput().messages || [];
        const initial = visible.find(m => m.role === 'user' && /unique|distinct/i.test(m.content || ''));
        if (initial) task = initial.content;
        else task = agent.session.snapshotEvents().filter(e => e.type === 'user/message').map(e => JSON.stringify(e.data)).join('\n');
      }
      return task;
    }
    function relevant() {
      return /unique|distinct/i.test(taskText()) && !/once per file|unique files|files based on (?:their )?content/i.test(taskText());
    }
    function entity() {
      const t = taskText();
      if (/\bIP(?:v4)?\b/i.test(t)) return 'ip';
      if (/error messages?/i.test(t)) return 'message';
      if (/\bwords?\b/i.test(t)) return 'word';
      return '';
    }
    function identityAdvice() {
      if (entity() === 'ip') return 'For an IP count, deduplicate extracted addresses, not entire log lines. Inspect a real sample. A portable IPv4 extraction is grep -h -oE "[0-9]{1,3}([.][0-9]{1,3}){3}". Do not use \\d with grep -E. Do not anchor to the start unless the task requires it; keep all task filters before discarding their fields.';
      if (entity() === 'message') return 'For error messages, inspect a real line and extract the full message suffix specified by the task, removing timestamp/severity metadata unless the task includes it in uniqueness. Keep every word of the message, trim only its outer whitespace, and honor any starts-with condition. A single whitespace field such as awk print $2 generally loses the message.';
      if (entity() === 'word') return 'For words, follow the task definition: whitespace-delimited tokens and punctuation-free words are different. When ignoring case, lowercase the actual tokens before sort -u; grep -i does not lowercase its output. Discard empty tokens.';
      return '';
    }
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      if (!relevant()) return result;
      const text = 'Respect the requested distinct-count scope: for a global count, combine extracted entities from all requested files before sort -u | wc -l; for per-file unique counts followed by a sum, deduplicate within each file. Use grep -h to suppress filename prefixes or cat selected files into one stream. Extract the requested entity from a real sample before deduplicating. ' + identityAdvice();
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || corrected || call.name !== 'bash_action' || !relevant()) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (!/\b(sort|uniq)\b/.test(script)) return decision;
      let reason = '';
      const extracts = /\b(awk|cut|sed|perl|python[0-9]*)\b/.test(script) || /\bgrep\s+(?:-[^\s]+\s+)*--only-matching\b/.test(script) || /\bgrep\s+(?:-[^\s]+\s+)*-[^-\s]*o/.test(script);
      if ((entity() === 'ip' || entity() === 'message') && /\bgrep\b/.test(script) && !extracts) {
        reason = 'This pipeline selects whole log lines and deduplicates those lines, rather than extracting the requested entity. ' + identityAdvice() + ' Retry with the requested field extraction before sort/uniq, suppress filenames with grep -h, and preserve the file selection and filters.';
      }
      if (entity() === 'word' && /ignor\w*\s+case|case[- ]insensitiv/i.test(taskText()) && !/tolower|\\L|\btr\b[^|;]*(?:\[:lower:\]|a-z)/.test(script)) {
        reason = 'This case-insensitive word count has no output lowercase normalization before deduplication. grep -i only changes matching. ' + identityAdvice() + ' Retry with token lowercase normalization before sort/uniq; preserve the selected files.';
      }
      if (!reason) for (const match of script.matchAll(/\bgrep\b([^|;]*)/g)) {
        const tokens = match[1].match(/'[^']*'|"[^"]*"|[^\s]+/g) || [];
        if (tokens.some(t => t === '--no-filename' || /^-[^-]*h/.test(t))) continue;
        const operands = tokens.filter(t => !t.startsWith('-') && !/^[012]?>/.test(t));
        const multi = operands.length > 2 || operands.slice(1).some(t => /[*?]/.test(t)) || /\bxargs\s*$/.test(script.slice(0, match.index)) || tokens.some(t => /^-[^-]*[rR]/.test(t));
        if (!multi) continue;
        reason = 'This grep can prefix each extracted value with its filename, so sort/uniq would count the same entity separately for each file. Retry the command with grep -h (for example grep -h -oE PATTERN FILES | sort -u | wc -l), or cat all selected files before extracting. Preserve the task filters and target field.';
        break;
      }
      if (!reason) return decision;
      corrected = true;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
