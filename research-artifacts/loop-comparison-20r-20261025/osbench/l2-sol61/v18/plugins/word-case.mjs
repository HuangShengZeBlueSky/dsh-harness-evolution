export const name='word-case';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent}=p;let corrected=false;
 const term=()=>{
  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
  if(/case[- ]sensitive|case sensitively|exact string|case[- ]insensitive|ignor(?:e|ing) case/i.test(task))return '';
  const m=task.match(/word\s+["'`]([a-z]+)["'`]/);return m?.[1]||'';
 };
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();const word=term();if(!word)return r;
  const text='The task asks for the natural-language word '+JSON.stringify(word)+' without requiring case sensitivity. Match content with grep -i so capitalization variants are included. Preserve all requested file scope and exclusions. Count matching lines, not matching filenames.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();const word=term();if(d.kind!=='allow'||!word||corrected||call.name!=='bash_action')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const s=a.script;
  if(/\bgrep\b/.test(s)&&s.includes(word)&&!/\s-[a-zA-Z]*i[a-zA-Z]*(?=\s|$)|--ignore-case/.test(s)){
   corrected=true;const reason='Include capitalization variants of the requested word. Retry the same content search with grep -i; keep the file scope and count matching lines. Suggested command: '+s.replace(/\bgrep\b/,'grep -i');
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  }return d;
 });
});}
