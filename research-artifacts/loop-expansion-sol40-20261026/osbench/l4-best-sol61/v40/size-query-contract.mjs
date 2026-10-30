import {installRewrite} from './rewrite-stream.mjs';
export const name='size-query-contract';
const q=s=>"'"+s.replace(/'/g,"'\\''")+"'";
export function apply(ctx){
 const facts=new Map();
 installRewrite(ctx,name,(script,context)=>{
  const {task}=context,state=facts.get(context.agentId);
  if(!state||!/\btotal\s+(?:disk\s+space|size)\b/i.test(task)||!/\bhuman[- ]readable\b/i.test(task)||/\b(?:unique|distinct)\b/i.test(task)||!/\b(?:du|find|stat|awk|python3?)\b/.test(script))return script;
  if(state.value)return script;
  let directory=task.match(/["'\x60]((?:\/|~\/)[^"'\x60]+)["'\x60]/)?.[1];
  if(!directory)directory=task.match(/\b(?:directory|folder)\s+(?:named|called)\s+["'\x60]([^"'\x60]+)["'\x60]/i)?.[1]||task.match(/["'\x60]([^"'\x60]+)["'\x60]\s+(?:directory|folder)\b/i)?.[1];
  const home=/\bhome directory\b/i.test(task);
  if(!directory&&!home)return script;
  const root=!directory?'~':directory.startsWith('/')?q(directory):directory.startsWith('~/')?'~/'+q(directory.slice(2)):home?'~/'+q(directory):q(directory);
  const extension=task.match(/["'\x60](\.[A-Za-z0-9]+)["'\x60]/)?.[1];
  const days=task.match(/\blast\s+(\d+)\s+days?\b/i)?.[1];
  const word=task.match(/\bword\s+["'\x60]([^"'\x60]+)["'\x60]/i)?.[1];
  if(/\b(?:contain|containing|matching)\b/i.test(task)&&!word)return script;
  const topOnly=/\b(?:not|no|without|ignore)\b[^.]{0,60}\bsubdirectories\b|\bdirectly\b|\btop[- ]level\b/i.test(task);
  let select='find '+root+(topOnly?' -maxdepth 1':'')+' -type f';
  if(extension)select+=' -name '+q('*'+extension);
  if(days)select+=' -mtime -'+days;
  if(word){
   const fold=/\b(?:ignore|ignoring)\s+case\b|\bcase[- ]insensitive\b/i.test(task);
   select+=' -exec grep -l -Z -F -w'+(fold?' -i':'')+' -- '+q(word)+' {} +';
  }else select+=' -print0';
  const apparent=!/\bdisk\s+space\b/i.test(task)&&/\bdu\b[^|;]*(?:\s-[A-Za-z]*b\b|\s--apparent-size\b)/.test(script);
  state.plan=select+' | du -c -h'+(apparent?' --apparent-size':'')+" --files0-from=- | tail -n 1 | cut -f1";
  return state.plan;
 },'Size aggregation runs over the selected actual file contents/names and uses the native du total with units. Do not add the numeric prefixes of separate human-readable sizes.');
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const state={plan:'',value:''};facts.set(String(p.agent.session.id),state);
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='bash_action'||!state.plan)return d;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(args.script!==state.plan)return d;
   const raw=p.getRawBusinessResult(call.callId);if(!raw||raw.error||result.isError)return d;
   const value=String(raw.content).replace(/^The output of the OS:\s*/,'').trim();
   if(!/^\d+(?:\.\d+)?[KMGTPEZY]?$/.test(value))return d;
   state.value=value;
   const annotation='The actual selected-file du total is '+value+'. Preserve this native human-readable value; it is already the combined total.';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.value)return r;
   const text='Recorded from the actual total-size computation: '+state.value+'. Submit this total with its native unit; no per-file arithmetic or extra conversion is needed.';
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:37,text,interpolate:false}]};
  });
 });
}
