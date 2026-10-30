export const name='line-count';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent}=p;
 const active=()=>/lines?\b[\s\S]{0,200}\bcontain|lines?\b[\s\S]{0,100}\bERROR/i.test(agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>JSON.stringify(e.data)).join(' '));
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();if(!active())return r;
  const text='Count matching LINES, not matching files or all lines of matching files. grep -l outputs filenames only. For a total matching-line count use grep -h PATTERN FILES | wc -l; with recursive selection use find DIR -type f -name GLOB -exec grep -h PATTERN {} + | wc -l. Preserve requested case and file exclusions. For per-file grep -c output, sum numeric counts, suppressing filename prefixes.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:26,text,interpolate:false}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||!active())return d;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(/\bgrep\s+-[a-zA-Z]*l\b/.test(args.script)&&/wc\s+-l/.test(args.script)){
   const reason='This counts filenames or all lines in selected files, not matching lines. Use grep -h with the same pattern and selected files, then wc -l.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  }return d;
 });
});}
