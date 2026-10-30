export const name = 'log-order';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getVisibleInput, getRawBusinessResult} = payload;
    let task = '', corrected = false, coverageUnknown = false, readCalls = 0, allFirstOnly = true;
    const listed = new Set(), read = new Set();
    function taskText() {
      if (!task) {
        const initial = (getVisibleInput().messages || []).find(m => m.role === 'user' && typeof m.content === 'string' && !/No tool call detected/i.test(m.content));
        if (initial) task = initial.content;
        else {
          const first = agent.session.snapshotEvents().find(e => e.type === 'user/message');
          if (first) task = (first.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        }
      }
      return task;
    }
    function mode() {
      const t = taskText();
      if (!/logs?|timestamps?|events?/i.test(t) || /\bmodified\b|\bmtime\b|modification time/i.test(t)) return '';
      if (/which day[\s\S]*(?:most|highest)|day[\s\S]*(?:highest|most)[\s\S]*(?:entries|events)/i.test(t)) return 'frequency';
      if (/\blast day\b/i.test(t)) return 'last-day';
      if (/\bearliest\b/i.test(t)) return 'earliest';
      if (/\bmost recent\b|\blatest\b/i.test(t)) return /filenames?|naming pattern|files?[^.]{0,40}named/i.test(t) ? 'filename-latest' : 'latest';
      return '';
    }
    function advice() {
      const m = mode();
      if (m === 'filename-latest') return 'Use the complete date encoded in the requested filenames to choose the global latest date across the file list, then process all requested files for that date with the original content conditions.';
      const common = 'Use all requested log files and all relevant entries for a global result. Inspect a sample for layout, then perform the aggregation over complete inputs. ';
      if (m === 'last-day') return common + 'First find the maximum YYYY-MM-DD date across all log entries. Then count the requested severity entries on that exact date across all files. Keep this date selection and the severity condition as separate stages.';
      if (m === 'frequency') return common + 'Assign each actual log entry its full YYYY-MM-DD date and count entries per date across all files. If the task encodes the day in filenames, weight each full filename date by the number of log entries in that file. Return the complete date with the highest total count.';
      if (m === 'earliest') return common + 'Compare full timestamps from log contents while retaining each source filename, and select the global minimum. Return the requested filename or relative path from home exactly as specified. First lines establish an extremum only when chronological ordering is guaranteed.';
      return common + 'Extract full timestamps from log contents and select the global maximum. Preserve the full requested timestamp format, or the complete log entry when the task asks for the entry. Event timestamps come from record contents rather than file modification metadata.';
    }
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      if (!mode()) return result;
      const text = advice();
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:35,text,interpolate:false}]};
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'bash_action' || !mode() || mode() === 'filename-latest') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const script = args.script || '';
      if (/\bls\b/.test(script) && !/\b(cat|head|tail|awk|sed)\b/.test(script)) {
        for (const line of String(raw.content).split('\n').map(l => l.trim())) {
          if (/^[^\s]+\.(?:log|txt)$/i.test(line)) listed.add(line.split('/').at(-1));
        }
        audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,listed_files:[...listed]});
        return decision;
      }
      if (/\bbasename\b/.test(script) && !/\b(cat|grep|awk|sed|head|tail|wc)\b/.test(script)) return decision;
      if (/\b(python[0-9]*|perl|ruby|node)\b|\bsh\s+-c\b/.test(script)) coverageUnknown = true;
      if (!/\b(cat|grep|awk|sed|head|tail|wc|sort|cut)\b/.test(script)) return decision;
      readCalls++;
      allFirstOnly = allFirstOnly && /\b(?:head|tail)\s+(?:-n\s*1\b|-1\b)/.test(script) && !/\bsort\b/.test(script);
      if (/\*|\$/.test(script)) coverageUnknown = true;
      for (const file of listed) if (script.includes(file)) read.add(file);
      return decision;
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || corrected || !['answer_action','finish_action'].includes(call.name) || !mode() || mode() === 'filename-latest' || coverageUnknown) return decision;
      let reason = '';
      if (listed.size > 1 && read.size < listed.size) {
        const missing = [...listed].filter(f => !read.has(f));
        reason = 'The observed file list includes ' + [...listed].join(', ') + '. The current explicit content reads do not cover ' + missing.join(', ') + '. Compute the global result using all requested files before submitting.';
      } else if (readCalls && allFirstOnly && !/\bsorted\b|\bchronological\b/i.test(taskText())) {
        reason = 'Only first/last-line probes have been observed. Scan the complete selected log entries to establish the global extremum while retaining the requested filename or path.';
      }
      if (!reason) return decision;
      corrected = true;
      reason += ' ' + advice() + ' This correction is requested once.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
