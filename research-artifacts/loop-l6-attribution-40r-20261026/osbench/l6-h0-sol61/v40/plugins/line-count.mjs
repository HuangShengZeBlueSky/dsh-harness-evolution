export const name = 'line-count';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit, getVisibleInput}, next) => {
    await next();
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const event = agent.session.snapshotEvents().find(e => e.type === 'user/message');
      const task = event?.data.content.filter(b => b.type === 'text').map(b => b.text).join('') || getVisibleInput().messages.find(m => m.role === 'user')?.content || '';
      if (!/(number of lines|count (?:how many )?lines)/i.test(task) || !/contain/i.test(task)) return result;
      let text = 'For this line-count task: use grep -h PATTERN FILES | wc -l to count matching lines. grep -l selects filenames, not lines; do not feed those filenames to wc -l. grep -o counts occurrences, not lines. Preserve the requested scope and extensions; use ~/*.txt or ~/DIRECTORY/*.log, without escaping the slash after ~. The home directory is ~ (possibly /root), not /home/$(whoami). For recursion use find DIRECTORY -type f -name EXTENSION -exec grep -h PATTERN {} + | wc -l; add -maxdepth 1 if subdirectories are excluded. Add -i only when requested, -w for whole words, and -v when excluding matching lines. A path error followed by 0 is not a valid count: fix the path. Once computed, invoke answer_action with the number using a real tool call.';
      let specific='';
      if(/unique|distinct/i.test(task))specific+='Count UNIQUE MATCHING LINES: grep -h PATTERN FILES | sort -u | wc -l. Include sort -u before counting. ';
      if(/exclud.*(?:empty|whitespace)|non.?empty|non.?blank/i.test(task))specific+="Count NONBLANK lines: grep -hvE '^[[:space:]]*$' FILES | wc -l. The -v is required to exclude blank lines; do not count the blank matches. ";
      if(/subdirector|nested|all levels/i.test(task))specific+='Recursive scope: use find DIRECTORY -type f ... -exec grep ... {} +. A **/*.log glob is not recursive unless globstar is enabled and may miss files directly in DIRECTORY. ';
      text=specific+text;
      audit({method_id:name, hook:'system-prompt/assemble', text});
      return {...result, sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
  });
}
