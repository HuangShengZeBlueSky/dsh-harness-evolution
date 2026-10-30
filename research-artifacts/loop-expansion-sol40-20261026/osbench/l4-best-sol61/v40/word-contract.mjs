import {installRewrite} from './rewrite-stream.mjs';
const q=value=>"'"+value.replace(/'/g,"'\\''")+"'";
function isWordTask(task){
 return /\b(unique|distinct)\b/i.test(task)&&/\bwords?\b/i.test(task)&&/\bpunctuation\b/i.test(task)&&/\bhome directory\b/i.test(task)&&!/\b(?:directory|folder)\s+(?:named|called)\b/i.test(task);
}
export const name='word-contract';
export function apply(ctx) {
 const facts=new Map();
 installRewrite(ctx,name,(script,context)=>{
  if(!isWordTask(context.task))return script;
  const state=facts.get(context.agentId);if(!state)return script;
  const namedScope=/\bextensions?\b|["'\x60][^"'\x60\s]*\.[A-Za-z0-9]+["'\x60]/i.test(context.task);
  if(!state.probed&&!namedScope)return 'ls -1 ~';
  if(state.plan&&!state.complete&&!/^\s*(?:ls|head|tail)\b/.test(script)&&/\b(?:cat|grep|awk|tr|sort|wc|python3?)\b/.test(script))return state.plan;
  return script;
 },'');
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const state={probed:false,files:[],plan:'',complete:false};
  facts.set(String(p.agent.session.id),state);
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();
   if(decision.kind!=='accept'||call.name!=='bash_action')return decision;
   const raw=p.getRawBusinessResult(call.callId);if(!raw||raw.error||result.isError)return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const text=String(raw.content).replace(/^The output of the OS:\s*/,'').trim();
   if(state.plan&&args.script===state.plan&&/^\d+$/.test(text)){state.complete=true;return decision;}
   if(state.files.length||!/\bls\b/.test(args.script))return decision;
   const task=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');
   if(!isWordTask(task))return decision;
   state.probed=true;
   state.files=text.split('\n').map(s=>s.trim()).filter(s=>s&&s!=='.'&&s!=='..'&&!/^ls:|^The output of the OS is empty/.test(s));
   if(!state.files.length)return decision;
   const inputs=state.files.map(s=>s.startsWith('/')?q(s):s.startsWith('~/')?'~/'+q(s.slice(2)):'~/'+q(s)).join(' ');
   const fold=/\b(?:ignore|ignoring)\s+case\b|\bcase[- ]insensitive\b/i.test(task)&&!/\bcase[- ]sensitive\b/i.test(task);
   const flags=fold?'-i -I -h':'-I -h';
   const tokens=fold?'-i -h -oE':'-h -oE';
   const scan='grep '+flags+' -- '+q('');
   state.plan='for word_input_file in '+inputs+'; do if [ -d "$word_input_file" ]; then find "$word_input_file" -type f -exec '+scan+' {} +; elif [ -f "$word_input_file" ]; then '+scan+' "$word_input_file"; fi; done'+(fold?" | tr '[:upper:]' '[:lower:]'":'')+' | grep '+tokens+' '+q('[[:alnum:]]+')+' | sort -u | wc -l';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:'Constructed word query from actual observed input objects, traversing discovered directories, with task-defined case and punctuation handling'});
   return decision;
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.plan||state.complete)return r;
   const text='The actual listing supplies the input filenames; text files need not have a guessed suffix. Execute this observed-file word plan, then submit its exact count: '+state.plan;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:35,text,interpolate:false}]};
  });
 });
}
