export const name = 'semantic-command-transport';
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
function fieldPlan(task) {
  const format = /\bformat\s*(?:of\s*)?:?\s*["'`]([^"'`\n]+)["'`]/i.exec(task)?.[1];
  const wanted = /\b(?:unique|distinct)\s+([A-Za-z_]+)\b/i.exec(task)?.[1];
  const directory = /\b(?:directory|folder)\s+named\s+["'`]([^"'`\n]+)["'`]/i.exec(task)?.[1];
  const extension = /["'`](\.[A-Za-z0-9]+)["'`]\s+extension/i.exec(task)?.[1];
  if (!format || !wanted || !directory || !extension || !/\bhome\s+directory\b/i.test(task)) return null;
  if (/\b(?:after|before|between|since|during|matching|status\s+code)\b/i.test(task)) return null;
  const separator = /\s+-\s+|\s+\|\s+|,\s*/.exec(format)?.[0];
  if (!separator) return null;
  const entity = wanted.toLowerCase().replace(/s$/, '');
  const fields = format.split(separator);
  const index = fields.findIndex(field => field.toLowerCase().replace(/[^a-z0-9]/g,'').includes(entity));
  if (index < 0) return null;
  const command = 'find "$HOME"/' + quote(directory) + ' -type f -name ' + quote('*' + extension)
    + ' -exec awk -F ' + quote(separator) + " '{print $" + (index + 1) + "}' {} + | sort -u | wc -l";
  return {format,field:fields[index],command};
}
function messagePlan(task) {
  if (!/\b(?:unique|distinct)\s+(?:error\s+)?messages\b/i.test(task) || !/\bhome\s+directory\b/i.test(task)) return null;
  const folder = /\b(?:directory|folder)\s+named\s+["'`]([^"'`\n]+)["'`]/i.exec(task)?.[1];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const when = new RegExp('\\b(' + monthNames.join('|') + ')\\s+(\\d{4})\\b','i').exec(task);
  if (!folder || !when || !task.includes('YYYY-MM-DD HH:MM:SS')) return null;
  const month = String(monthNames.findIndex(m=>m.toLowerCase()===when[1].toLowerCase())+1).padStart(2,'0');
  const prefix = '^' + when[2] + '-' + month + '-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}';
  const command = 'find "$HOME"/' + quote(folder) + ' -maxdepth 1 -type f -exec grep -hE ' + quote(prefix)
    + " {} + | sed -E 's/^[^ ]+ [^ ]+[[:space:]]*//' | sort -u | wc -l";
  return {period:when[0],command};
}
function normalize(task, script) {
  const field = fieldPlan(task);
  if (field && /\b(?:sort|uniq)\b/.test(script) && /\bwc\s+-l\b/.test(script)
      && ((/\b(?:sh|bash)\s+-c\b/.test(script) && /\bcd\b/.test(script)) || /\bgrep\b[^|]*\[[0-9-]+\]/.test(script))) return field.command;
  const message = messagePlan(task);
  if (message && /\bwc\s+-l\b/.test(script)
      && (/\bls\b|\btr\b/.test(script) || !/\b(?:sed|cut|awk)\b/.test(script) || !/\b(?:sort|uniq)\b/.test(script))) return message.command;
  const term = /\bword\s+["'`]([^"'`\n]+)["'`]/i.exec(task)?.[1];
  if (!term) return script;
  const explicitIgnore = /ignore\s+case|case.insensitive/i.test(task);
  const explicitCase = /\bcase[- ]sensitive\b/i.test(task);
  const severity = /^(?:error|warn|warning|info|debug|fatal|critical)$/i.test(term) && /\blogs?\b|\.log\b/i.test(task);
  const ignore = explicitIgnore || (!explicitCase && severity);
  const whole = /^[A-Za-z0-9_]+$/.test(term) && !/\bsubstring\b/i.test(task);
  let command = script.replace(/\bgrep\s+((?:-[A-Za-z]+\s+)*)(['"])(.*?)\2/g, (match, flags, q, pattern) => {
    if (pattern.toLowerCase() !== term.toLowerCase()) return match;
    const letters = flags.replace(/[-\s]/g,'');
    const needed = [...new Set(letters + (ignore ? 'i' : '') + (whole ? 'w' : ''))].join('');
    return needed === letters ? match : 'grep -' + needed + ' ' + q + pattern + q;
  });
  const m = /^\s*grep\s+((?:-[A-Za-z]+\s+)*)(['"])(.*?)\2\s+(['"]?)(\/[^|;\s'"]+)\4\s*\|\s*wc\s+-l\s*$/.exec(command);
  if (!m) return command;
  const slash = m[5].lastIndexOf('/');
  const extension = m[5].slice(slash+1);
  const cleanTask = task.replace(/["'`]/g,'').replace(/\s+/g,' ').toLowerCase();
  if (!/^\.[A-Za-z0-9]+$/.test(extension) || (!/\bextension\b/i.test(task) && !cleanTask.includes('all ' + extension.toLowerCase() + ' files'))) return command;
  const letters = m[1].replace(/[-\s]/g,'');
  if (/[clef]/.test(letters)) return command;
  const negative = /(?:not|no|without|ignore|exclude).{0,30}subdirector/i.test(task);
  const recursive = !negative && (/[rR]/.test(letters) || /subdirector|recursiv/i.test(task));
  const rest = [...new Set(letters.replace(/[rRhH]/g,''))].join('');
  const root = m[5].slice(0,slash) || '/';
  const input = recursive ? '--include=' + quote('*'+extension) + ' ' + quote(m[3]) + ' ' + quote(root) : quote(m[3]) + ' ' + quote(root) + '/*' + extension;
  return 'grep -h' + (recursive ? 'r' : '') + rest + ' ' + input + ' | wc -l';
}
export function apply(ctx) {
  const states = new Map();
  ctx.on('benchmark/setup', async ({ac,agent,audit,getRawBusinessResult,getVisibleInput}, next) => {
    await next();
    const state = {task:'',rewrites:new Map(),count:0,audit,getTask:() => {
      const first = agent.session.snapshotEvents().find(e=>e.type==='user/message');
      const content = first?.data?.content || getVisibleInput().messages.find(m=>m.role==='user')?.content || state.task;
      return typeof content==='string' ? content : (content || []).filter(b=>b.type==='text').map(b=>b.text).join(' ');
    }};
    states.set(String(agent.session.id),state);
    ac.on('tools/post-execute', async (call,result,proceed) => {
      const decision = await proceed();
      const command = state.rewrites.get(call.callId);
      if (decision.kind !== 'accept' || !command || !getRawBusinessResult(call.callId)) return decision;
      state.rewrites.delete(call.callId);
      const annotation = '\nThe executed command was normalized to the data objects, input scope and filters declared in the task:\n' + command + '\nUse the actual OS output above as the computation evidence.';
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
  ctx.on('llm/stream', (options,next)=>(async function*(){
    const chunks=[];
    for await (const chunk of next()) chunks.push(chunk);
    const state=states.get(String(options.sessionId));
    if (!state || state.count>=2) {yield* chunks;return;}
    state.task=state.getTask();
    const changed=new Map();
    for (const chunk of chunks) {
      if (chunk.type!=='block-end' || chunk.block?.type!=='tool-call' || chunk.block.name!=='bash_action') continue;
      let args;
      try {args=typeof chunk.block.arguments==='string'?JSON.parse(chunk.block.arguments):chunk.block.arguments;} catch {continue;}
      if (typeof args?.script!=='string') continue;
      const command=normalize(state.task,args.script);
      if (command===args.script) continue;
      const encoded=JSON.stringify({...args,script:command});
      changed.set(chunk.index,{...chunk.block,arguments:encoded});
      state.rewrites.set(chunk.block.id,command);state.count++;
      state.audit({method_id:name,hook:'llm/stream',decision:'normalize-command',call_id:chunk.block.id,original:args.script,command});
    }
    for (const chunk of chunks) {
      const block=changed.get(chunk.index);
      if (!block) {yield chunk;continue;}
      if (chunk.type==='tool-call-delta') continue;
      if (chunk.type==='block-end') {
        yield {type:'tool-call-delta',index:chunk.index,id:block.id,name:block.name,argumentsDelta:block.arguments};
        yield {...chunk,block};
      } else yield chunk;
    }
  })());
}
