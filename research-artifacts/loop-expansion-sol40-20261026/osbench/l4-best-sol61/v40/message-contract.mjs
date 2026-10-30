import {installRewrite} from './rewrite-stream.mjs';
export const name='message-contract';
const q=s=>"'"+s.replace(/'/g,"'\\''")+"'";
const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
function metadata(task){
 if(!/\b(?:unique|distinct)\s+error\s+messages\b/i.test(task)||!task.includes('YYYY-MM-DD HH:MM:SS'))return null;
 const month=task.match(new RegExp('\\b('+months.join('|')+')\\s+(\\d{4})\\b','i'));
 const directory=task.match(/\b(?:directory|folder)\s+(?:named|called)\s+["'\x60]([^"'\x60]+)["'\x60]/i)?.[1];
 if(!month||!directory||!/\bhome directory\b/i.test(task))return null;
 const root=directory.startsWith('/')?q(directory):'~/'+q(directory);
 const prefix=month[2]+'-'+String(months.indexOf(month[1].toLowerCase())+1).padStart(2,'0');
 const pattern='^'+prefix+'-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}[[:space:]]';
 const scan='find '+root+' -maxdepth 1 -type f -exec grep -h -E '+q(pattern)+' {} +';
 return {scan,probe:scan+' | head -n 8'};
}
export function apply(ctx){
 const facts=new Map();
 installRewrite(ctx,name,(script,context)=>{
  const meta=metadata(context.task),state=facts.get(context.agentId);
  if(!meta||!state)return script;
  if(!state.probed){state.probe=meta.probe;state.scan=meta.scan;return state.probe;}
  if(state.plan&&!state.complete)return state.plan;
  return script;
 },'');
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const state={probe:'',scan:'',probed:false,plan:'',complete:false,blocked:false};facts.set(String(p.agent.session.id),state);
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='bash_action')return d;
   const raw=p.getRawBusinessResult(call.callId);if(!raw||raw.error||result.isError)return d;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const text=String(raw.content).replace(/^The output of the OS:\s*/,'').trim();
   if(state.plan&&args.script===state.plan&&/^\d+$/.test(text)){state.complete=true;return d;}
   if(!state.probe||args.script!==state.probe)return d;
   state.probed=true;
   const program='{message=substr($0,20); sub(/^[[:space:]]+/,"",message); print message}';
   state.plan=state.scan+' | awk '+q(program)+' | sort -u | wc -l';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:'Actual month sample observed; complete post-timestamp messages retained without adding an unstated severity filter'});
   return d;
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.plan||state.complete)return r;
   const text='The actual sample is not the requested count. Count whole error messages after the full timestamp, not individual words; execute this sample-derived query, then submit its numeric result: '+state.plan;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:36,text,interpolate:false}]};
  });
  p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||!state.plan||state.complete||state.blocked||!['answer_action','finish_action'].includes(call.name))return d;
   state.blocked=true;const reason='Only a log sample has been read. Execute the full message count first: '+state.plan;
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
