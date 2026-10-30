export const name = 'matching-lines';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getVisibleInput} = payload;
    let task = '', corrected = false;
    function taskText() {
      if (!task) {
        const users = (getVisibleInput().messages || []).filter(m => m.role === 'user');
        const initial = users.find(m => typeof m.content === 'string' && !/No tool call detected/i.test(m.content));
        if (initial) task = initial.content;
        else {
          const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
          if (first) task = (first.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        }
      }
      return task;
    }
    function relevant() {
      const t = taskText();
      return !/unique|distinct/i.test(t) && /(?:number of|count(?: the)?(?: total)?(?: number of)?|how many)\s+lines?\b/i.test(t);
    }
    function contentMode() {
      const t = taskText();
      const explicit = /lines?\s+(?:(?:that|which)\s+)?(?:contain|match|with)\b|only (?:include|count) lines/i.test(t);
      if (/\b(?:file\s*names?|names)\s+(?:(?:that|which)\s+)?contain/i.test(t) && !explicit) return false;
      return explicit || /\b(?:word|string|pattern)\b|non.?empty|empty lines|timestamp|date range/i.test(t);
    }
    function advice() {
      if (!contentMode()) return 'Count the lines in the selected files, not the file paths. Select files by the requested name, path, extension, modification time and recursion rules, read their contents with cat, then pipe to wc -l for one total. A condition on filenames selects files; it does not impose a content-word filter on their lines.';
      const t = taskText();
      const flags = ['-h'];
      if (/case[- ]insensitiv|ignor\w*\s+case/i.test(t)) flags.push('-i');
      if (/standalone|whole[- ]word/i.test(t)) flags.push('-w');
      if (/exclud(?:e|ing)\s+lines|lines?\s+that\s+(?:do not|don't)\s+contain/i.test(t)) flags.push('-v');
      return 'Count original input lines after applying all requested line conditions. Emit the qualifying full lines with grep ' + flags.join(' ') + ', then pipe to wc -l for one numeric total. Each qualifying line counts once. Keep the requested file set, recursion, time and pattern conditions. Use this direct line-filtering pipeline for the calculation.';
    }
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      if (!relevant()) return result;
      const text = advice();
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:30,text,interpolate:false}]};
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || corrected || call.name !== 'bash_action' || !relevant()) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      const wcLines = /\bwc\s+(?:-[a-zA-Z]*l[a-zA-Z]*\b|--lines\b)/.test(script);
      let problem = '';
      if (!contentMode() && /\bfind\b[\s\S]*\|\s*wc\s+(?:-l|--lines)\b/.test(script) && !/\b(cat|grep|awk|sed|xargs)\b/.test(script)) {
        problem = 'The task asks for content lines, while this pipeline counts selected file paths.';
      }
      const greps = [...script.matchAll(/\bgrep\b([^|;]*)/g)];
      if (greps.length) {
        const last = greps.at(-1)[1];
        const tokens = last.match(/'[^']*'|"[^"]*"|[^\s]+/g) || [];
        const flags = tokens.filter(t => t.startsWith('-'));
        const hasFlag = ch => flags.some(t => t.startsWith('-') && !t.startsWith('--') && t.includes(ch));
        if (wcLines && (hasFlag('l') || hasFlag('o') || hasFlag('c') || flags.some(t => ['--files-with-matches','--only-matching','--count'].includes(t)))) {
          problem = 'The task asks for original qualifying input lines. Retry at that counting unit.';
        } else if ((wcLines || hasFlag('c')) && /standalone|whole[- ]word/i.test(taskText()) && !hasFlag('w') && !flags.includes('--word-regexp') && !/\\b|\\<|\\>/.test(last)) {
          problem = 'Apply the task’s standalone-word condition to the matching input lines.';
        }
      }
      if (!problem) return decision;
      corrected = true;
      const reason = problem + ' ' + advice() + ' This correction is requested once.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
