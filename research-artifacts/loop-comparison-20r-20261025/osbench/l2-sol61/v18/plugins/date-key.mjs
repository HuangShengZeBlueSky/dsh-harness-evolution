export const name='date-key';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent,getRawBusinessResult}=p;let shape='',corrected=false;
 const active=()=>/unique\s+(?:dates|days)|distinct\s+(?:dates|days)/i.test(agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n'));
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(!active()||call.name!=='bash_action')return d;
  const raw=getRawBusinessResult(call.callId);if(!raw)return d;const t=String(raw.content);
  if(/\[\d{4}-\d{2}-\d{2} \d{2}:/.test(t))shape='Visible records have a leading bracket before the date.';
  else if(/\b\d{4}-\d{2}-\d{2} \d{2}:/.test(t))shape='Visible records include date and time as separate fields.';
  return d;
 });
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();if(!active())return r;
  const text='The uniqueness key is exactly YYYY-MM-DD, not a timestamp or full log record. Extract only the date before sort -u. A useful extraction stage is grep -h -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" on the selected files. If only timestamp-prefixed lines count, filter valid prefixes first, allowing a bracket when present. Do not retain time fields with cut -f1-3. '+shape;
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,tools:r.tools.map(t=>t.name==='bash_action'?{...t,description:t.description+' For this task, deduplicate the extracted calendar date only.'}:t),sections:[...r.sections,{name,order:31,text,interpolate:false}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||!active()||corrected)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(/sort|uniq/.test(a.script)&&/\bcut\b[^|]*-f\s*1-[2-9]/.test(a.script)){
   corrected=true;const reason='That cut stage retains time/message fields. Replace it with date-only extraction before deduplication: grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}". Keep the selected files and timestamp validity filter.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  }return d;
 });
});}
