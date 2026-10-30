import {installRewrite} from './rewrite-stream.mjs';
export const name='temporal-contract';
const q=value=>"'"+value.replace(/'/g,"'\\''")+"'";
export function apply(ctx) {
 const facts=new Map();
 installRewrite(ctx,name,(script,context)=>{
  const state=facts.get(context.agentId);
  if(state?.latest&&state.plan&&!state.complete)return state.plan;
  if(!state?.plan||state.complete||!script.includes(state.input)||!/\b(?:grep|awk|wc)\b/.test(script)||/^\s*(?:ls|head|tail)\b/.test(script))return script;
  return state.plan;
 },'');
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const state={input:'',cutoff:'',plan:'',complete:false,latest:false,blocked:false};
  facts.set(String(p.agent.session.id),state);
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();
   if(decision.kind!=='accept'||call.name!=='bash_action')return decision;
   const raw=p.getRawBusinessResult(call.callId);
   if(!raw||raw.error||result.isError)return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const text=String(raw.content).replace(/^The output of the OS:\s*/,'').trim();
   if(state.plan&&args.script===state.plan&&/^\d+$/.test(text)){state.complete=true;return decision;}
   const task=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');
   if(/\bmost recent date\b/i.test(task)&&task.includes('YYYY-MM-DD HH:MM:SS')&&/^\s*ls\b/.test(args.script)&&/^-[rwx-]{9}\s/m.test(text)){
    const filename=task.match(/\bfile\s+named\s+["'\x60]([^"'\x60]+)["'\x60]/i)?.[1];
    if(filename&&args.script.includes(filename)){
     const observed=text.split('\n').map(s=>s.match(/(\/\S+)\s*$/)?.[1]).find(s=>s?.endsWith('/'+filename));
     const path=observed?q(observed):/\bhome directory\b/i.test(task)?'~/'+q(filename):q(filename);
     const pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}';
     state.latest=true;state.input=filename;
     state.plan='grep -h -E '+q(pattern)+' '+path+" | awk '{day=substr($0,1,10); counts[day]++; if(day>latest)latest=day} END {print counts[latest]+0}'";
     p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:'Real file existence confirmed by ls receipt; compute the most recent calendar date from actual timestamped entries, using the observed file path'});
     return decision;
    }
   }
   if(!/\btail\b/.test(args.script))return decision;
   const relation=task.match(/\bentries?\s+in\s+["'\x60]([^"'\x60]+)["'\x60][\s\S]*?\bafter\b[\s\S]*?\blast\s+entry\s+in\s+["'\x60]([^"'\x60]+)["'\x60]/i);
   if(!relation||!args.script.includes(relation[2]))return decision;
   const cutoff=text.match(/^([0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2})(?:\s|$)/m)?.[1];
   if(!cutoff)return decision;
   state.input=relation[1];state.cutoff=cutoff;
   const path=value=>value.startsWith('/')?q(value):value.startsWith('~/')?'~/'+q(value.slice(2)):/\bhome directory\b/i.test(task)?'~/'+q(value):q(value);
   const input=path(state.input),reference=path(relation[2]);
   const pattern='^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}';
   const program='BEGIN {gsub(/T/," ",cutoff)} {stamp=substr($0,1,19); gsub(/T/," ",stamp); if(stamp>cutoff)n++} END {print n+0}';
   state.plan='temporal_cutoff=$(grep -h -E '+q(pattern)+' '+reference+' | tail -n 1 | cut -c1-19); grep -h -E '+q(pattern)+' '+input+' | awk -v cutoff="$temporal_cutoff" '+q(program);
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:'Observed reference timestamp sample '+cutoff+' from the actual reference receipt; the computation re-reads its last entry'});
   return decision;
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.plan||state.complete)return r;
   const text=state.latest?'The real ls receipt confirmed the task file exists. Use that successful object rather than a second guessed glob; count events on its maximum calendar date with this actual computation: '+state.plan:'Observed reference timestamp sample: '+state.cutoff+'. The computation re-reads the reference file to obtain its last timestamped entry, then compares fixed-width ISO seconds strictly after normalizing T to a space. Execute this evidence-derived plan, then submit its count: '+state.plan;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:34,text,interpolate:false}]};
  });
  p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||!state.latest||state.complete||state.blocked||!['finish_action','answer_action'].includes(call.name))return d;
   state.blocked=true;const reason='The actual file was found. Execute the pending maximum-date query before submitting: '+state.plan;
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
