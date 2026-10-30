export const name='transfer-state';
const textOf=x=>typeof x==='string'?x:Array.isArray(x)?x.map(b=>b.text||'').join('\n'):'';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,agent,audit,getRawBusinessResult,getVisibleInput}=payload;
 let target='',destination='',needed=1,held='',chosen='',advice='',recommended='',latestTake='',denials=0;
 const locations=new Map(),delivered=new Set(),checked=new Set();
 function init(){
  if(target)return;
  const source=(getVisibleInput()?.messages||[]).map(m=>textOf(m.content)).join('\n')+'\n'+agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>textOf(e.data?.content)).join('\n');
  const task=source.match(/Your task is to:\s*([^\n.]+)/i)?.[1]||'';
  let m=task.match(/^(?:find two (\w+) and put them|put two (\w+)) (?:in|on) (\w+)/i);
  if(m){target=m[1]||m[2];destination=m[3];needed=2;}
  else{m=task.match(/^put (?:a|an|some|the) (\w+) (?:in|on) (\w+)$/i);if(m){target=m[1];destination=m[2];}}
 }
 const targetItem=obj=>obj.startsWith(target+' ');
 function summary(){return `Transfer goal: put ${needed} distinct ${target} object(s) in/on ${chosen||destination}. Confirmed carrying: ${held||'nothing'}. Confirmed delivered IDs: ${[...delivered].join(', ')||'none'} (${delivered.size}/${needed}). ${advice} Only exact ${target} objects count; similar names are different types. Carry and deliver one object before taking another. A requested action is not a successful receipt. Keep calling take_action with exact AVAILABLE ACTIONS.`;}
 ac.on('system-prompt/assemble',async(assembly,context,next)=>{
  const result=await next();init();if(!target)return result;const text=summary();audit({method_id:name,hook:'system-prompt/assemble',text});
  return {...result,sections:[...result.sections,{name,order:27,text,interpolate:false}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const result=await next();init();if(result.kind!=='allow'||!target||!recommended||denials>=6)return result;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const a=args?.action||'';
  let reason='';
  if(held&&a.startsWith('take '))reason='An object is already held; deliver it before taking another.';
  if(a.startsWith('put ')&&(!held||!a.startsWith('put '+held+' ')))reason='This put does not match the confirmed carried object.';
  if(!held&&latestTake&&a!==latestTake&&/^(go to |put |take )/.test(a))reason='The exact undelivered target is available now; take it before leaving.';
  if(!held&&a.startsWith('go to ')&&checked.has(a.slice(6))&&recommended.startsWith('go to ')&&!checked.has(recommended.slice(6))&&![...locations].some(([obj,place])=>targetItem(obj)&&!delivered.has(obj)&&place===a.slice(6)))reason='This location was already inspected without a remaining exact target. Visit the unchecked location before repeating it.';
  if(reason){denials++;reason+=' Next action: '+recommended; audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
  return result;
 });
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();init();if(decision.kind!=='accept'||!target)return decision;
  const raw=getRawBusinessResult(call.callId),full=textOf(raw?.content)||textOf(result.content);const [obs,available='']=full.split('AVAILABLE ACTIONS:');
  if(!full.includes('AVAILABLE ACTIONS:')){const annotation=summary();audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};}
  const actions=available.split('\n').map(a=>a.trim()).filter(Boolean);
  let m=obs.match(/You pick up the (\w+ \d+) from the (\w+ \d+)/i);
  if(m){held=m[1];locations.delete(held);delivered.delete(held);}
  m=obs.match(/You put the (\w+ \d+) in\/on the (\w+ \d+)/i);
  if(m){if(held===m[1])held='';locations.set(m[1],m[2]);if(targetItem(m[1])&&m[2].startsWith(destination+' ')){chosen=chosen||m[2];if(m[2]===chosen)delivered.add(m[1]);}else delivered.delete(m[1]);}
  if(/You are not carrying anything/i.test(obs))held='';
  m=obs.match(/You are carrying:\s*(?:a |an )?(\w+ \d+)/i);if(m)held=m[1];
  m=obs.match(/(?:On the|In the) (\w+ \d+), you see/i)||obs.match(/The (\w+ \d+) is (?:open|closed)/i)||obs.match(/You open the (\w+ \d+)/i);
  if(m&&!/is closed/.test(obs)){
   const place=m[1];checked.add(place);
   for(const match of obs.matchAll(new RegExp('\\b'+target+' \\d+','g')))locations.set(match[0],place);
  }
  latestTake=!held?actions.find(a=>{const z=a.match(/^take (\w+ \d+) from /);return z&&targetItem(z[1])&&!delivered.has(z[1]);})||'':'';
  recommended='';
  if(held){
   if(targetItem(held)){
    const matchingPut=actions.find(a=>a.startsWith('put '+held+' in/on '+(chosen||destination)+' '))||actions.find(a=>a==='put '+held+' in/on '+chosen);
    if(matchingPut)recommended=matchingPut;
    else{
     if(!chosen){const go=actions.find(a=>a.startsWith('go to '+destination+' '));if(go)chosen=go.slice(6);}
     recommended=actions.find(a=>a==='open '+chosen)||actions.find(a=>a==='go to '+chosen)||'';
    }
   }else recommended=actions.find(a=>a.startsWith('put '+held+' in/on '))||'';
  }else{
   recommended=latestTake;
   if(!recommended){const known=[...locations].find(([obj,place])=>targetItem(obj)&&!delivered.has(obj)&&actions.includes('go to '+place));if(known)recommended='go to '+known[1];}
  }
  if(!recommended){
   const priority=['countertop','desk','diningtable','sidetable','coffeetable','dresser','bed','sofa','shelf','sinkbasin','bathtubbasin','toilet','tvstand','fridge','stoveburner'];
   const rank=a=>{const i=priority.indexOf(a.slice(6).split(' ')[0]);return i<0?30:i;};
   recommended=actions.find(a=>a.startsWith('open '))||actions.filter(a=>a.startsWith('go to ')&&!checked.has(a.slice(6))).sort((a,b)=>rank(a)-rank(b))[0]||'';
  }
  advice=recommended?'Immediate next available action: '+recommended+'.':`Search for the remaining ${needed-delivered.size} distinct target(s).`;
  const annotation=summary();audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
  return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
});}
