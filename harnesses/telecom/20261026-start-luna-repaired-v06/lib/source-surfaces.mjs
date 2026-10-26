/** Literal source YAML surfaces: no synthesized prompt or added business rule. */
import {checks, processors} from './native-account-rules.mjs';
const resultStates = new WeakMap();
const readText = result => (result.content || []).filter(x => x.type === 'text').map(x => x.text).join('');

export function installSourceSurface(ctx, method) {
 ctx.on('telecom/setup', async (payload, next) => {
  await next();
  const {ac, agent, body, audit, getAccountFacts, getRawBusinessResult} = payload;
  const c = method.config;
  const emit = (hook, data={}) => audit({method_id:method.id,target:method.target,surface:method.surface,hook,...data});
  emit('loaded',{source_path:method.source_path,implementation:'JavaScript on DSH hooks'});
  if (['prompt','description','schema'].includes(method.surface)) ac.on('system-prompt/assemble',async(_a,_context,next)=>{
   const assembly = await next(); emit('system-prompt/assemble');
   if(method.surface==='prompt') {
    const text = c.template.replaceAll('{domain_policy}',body.domain_policy).trim();
    return {...assembly,sections:assembly.sections.map(s=>s.name==='tau2-h0'?{...s,text}:s)};
   }
   return {...assembly,tools:assembly.tools.map(t=>t.name===method.target?{...t,...(method.surface==='description'?{description:c.text}:{parameters:c.parameters})}:t)};
  });
  if(method.surface==='result') {
   let state = resultStates.get(agent); if(!state){state=new Map();resultStates.set(agent,state);}
   ac.on('tools/post-execute',async(exec,result,next)=>{
    const decision = await next();
    if(decision.kind!=='accept'||exec.name!==method.target)return decision;
    const raw = getRawBusinessResult(exec.callId);
    if(result.isError||raw?.error){emit('tools/post-execute',{call_id:exec.callId,skipped:'business-error'});return decision;}
    let value=raw?.content ?? readText(result); try{value=JSON.parse(value);}catch{}
    const facts = ['line_status','customer_phone_line','bills_overdue'].includes(c.name)
      ? await getAccountFacts({tool:exec.name,args:exec.arguments||{},call_id:exec.callId,phase:'after'}) : {};
    const note = c.name==='annotation' ? c.text : processors[c.name](facts,value,exec.arguments||{},c.args||{});
    emit('tools/post-execute',{call_id:exec.callId,annotation:note||null});
    if(!note)return decision;
    let entry = state.get(exec.callId);
    if(!entry){entry={base:raw?.source_serialized_content ?? raw?.content ?? readText(result),notes:[]};state.set(exec.callId,entry);}
    entry.notes.push(note);
    return {...decision,content:[{type:'text',text:entry.base+'\n\n'+entry.notes.join('\n')}]};
   });
  }
  if(method.surface==='validation') ac.on('tools/pre-execute',async(exec,next)=>{
   const decision=await next(); if(decision.kind!=='allow'||exec.name!==method.target)return decision;
   const facts=await getAccountFacts({tool:exec.name,args:exec.arguments||{},call_id:exec.callId,phase:'before'});
   const reason=checks[c.name](facts,exec.arguments||{},c.args||{});
   emit('tools/pre-execute',{call_id:exec.callId,decision:reason?'deny':'allow',reason:reason||null});
   return reason?{kind:'deny',reason}:decision;
  });
 });
}
