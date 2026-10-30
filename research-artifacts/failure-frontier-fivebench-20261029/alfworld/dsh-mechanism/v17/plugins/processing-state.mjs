export const name='processing-state';
const textOf=x=>typeof x==='string'?x:Array.isArray(x)?x.map(c=>c.text||'').join('\n'):'';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
  await next();const {ac,agent,audit,getRawBusinessResult,getVisibleInput}=payload;
  let target='',process='',destination='',held='',targetPlace='',current='';
  const checked=new Set(),properties=new Map();
  let requiresSlice=false,sliceDone=false,knifePlace='',releaseKnifeAction='';
  let latestAdvice='',latestTake='',denials=0;
  const searchRank=a=>{const place=a.slice(6).split(' ')[0];return ['countertop','diningtable','sinkbasin','stoveburner','fridge','microwave','shelf'].indexOf(place)<0?(/^(cabinet|drawer)$/.test(place)?20:8):['countertop','diningtable','sinkbasin','stoveburner','fridge','microwave','shelf'].indexOf(place);};
  function init(){
    if(target)return;
    const source=(getVisibleInput()?.messages||[]).map(m=>textOf(m.content)).join('\n')+'\n'+agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>textOf(e.data?.content)).join('\n');
    const task=source.match(/Your task is to:\s*([^\n.]+)/i)?.[1]||'';
    let m=task.match(/^(heat|cool|clean)\s+(?:some|a|an|the)\s+(sliced\s+)?(\w+)\s+and put it (?:in|on)\s+(\w+)/i);
    if(m){process=m[1];requiresSlice=!!m[2];target=m[3];destination=m[4];}
    else {m=task.match(/^put\s+(?:a|an|some|the)\s+(hot|cool|clean)\s+(sliced\s+)?(\w+)\s+(?:in|on)\s+(\w+)/i);if(m){process={hot:'heat',cool:'cool',clean:'clean'}[m[1]];requiresSlice=!!m[2];target=m[3];destination=m[4];}}
  }
  ac.on('system-prompt/assemble',async(assembly,context,next)=>{
    const result=await next();init();if(!target)return result;
    const preparation=requiresSlice?`Sliced target required. Slice confirmed: ${sliceDone}. First locate the target and a knife. Hold the knife, use an exact available slice action on the visible target, then put down the knife and take the sliced target before processing. Do not treat an unsliced object as sliced. `:'';
    const text=preparation+`Processing goal: ${process} a ${target}, then place it in/on ${destination}. Take the exact target first. While holding it, use the explicit ${process} action with ${process==='heat'?'microwave':process==='cool'?'fridge':'sinkbasin'} from AVAILABLE ACTIONS. Do not put it into the appliance first. A pickup result does not confirm processing; require a successful ${process} receipt before final placement. Search unchecked locations if the target is not found. Copy exact available action strings into take_action. ${latestAdvice}`;
    audit({method_id:name,hook:'system-prompt/assemble',text});
    return {...result,sections:[...result.sections,{name,order:26,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
    const result=await next();init();
    if(result.kind==='allow'&&releaseKnifeAction&&denials<4){
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      if(args?.action!==releaseKnifeAction&&/^(go to |heat |cool |clean |take )/.test(args?.action||'')){
        denials++;const reason='Slicing is confirmed but the knife is still carried. First call take_action with action: '+releaseKnifeAction+'. Then take the sliced target before processing.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
      }
    }
    if(result.kind!=='allow'||!target||!latestTake||held.startsWith(target+' ')||denials>=4)return result;
    const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
    const action=args?.action||'';
    if(action!==latestTake&&/^(go to |heat |cool |clean |put )/.test(action)){
      denials++;const reason='Target is not confirmed carried. First call take_action with action: '+latestTake+'. Then process and place the held target.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    }
    return result;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
    const decision=await next();init();if(decision.kind!=='accept'||!target)return decision;
    const raw=getRawBusinessResult(call.callId),full=textOf(raw?.content)||textOf(result.content);
    const [obs,available='']=full.split('AVAILABLE ACTIONS:');const actions=available.split('\n').map(s=>s.trim()).filter(Boolean);
    let m=obs.match(/You pick up the (\w+ \d+) from the (\w+ \d+)/i);
    if(m){held=m[1];if(held.startsWith(target+' '))targetPlace='';}
    m=obs.match(/You put the (\w+ \d+) in\/on the (\w+ \d+)/i);
    if(m){if(held===m[1])held='';if(m[1].startsWith(target+' '))targetPlace=m[2];}
    if(/You are not carrying anything/i.test(obs))held='';
    m=obs.match(/You are carrying:\s*(?:a |an )?(\w+ \d+)/i);if(m)held=m[1];
    if(requiresSlice&&/You sliced? (?:the )?/.test(obs)&&obs.includes(target+' '))sliceDone=true;
    m=obs.match(/You (heat|cool|clean) the (\w+ \d+) using the /i);
    if(m){const old=properties.get(m[2])||{};if(m[1]==='heat'||m[1]==='cool'){delete old.heat;delete old.cool;}old[m[1]]=true;properties.set(m[2],old);}
    m=obs.match(/This is a (hot|cold|clean) (\w+ \d+)/i);
    if(m){const prop={hot:'heat',cold:'cool',clean:'clean'}[m[1]],old=properties.get(m[2])||{};if(prop!=='clean'){delete old.heat;delete old.cool;}old[prop]=true;properties.set(m[2],old);}
    m=obs.match(/(?:On the|In the) (\w+ \d+), you see/i)||obs.match(/The (\w+ \d+) is (?:open|closed)/i)||obs.match(/You open the (\w+ \d+)/i);
    if(m){current=m[1];if(!/is closed/.test(obs))checked.add(current);if(/\b(?:knife|butterknife) \d+/.test(obs))knifePlace=current;if(new RegExp('\\b'+target+' \\d+').test(obs))targetPlace=current;}
    const hasTarget=held.startsWith(target+' '),done=hasTarget&&properties.get(held)?.[process];
    latestTake=(hasTarget||(requiresSlice&&!sliceDone))?'':actions.find(a=>a.startsWith('take '+target+' '))||'';
    const station=process==='heat'?'microwave':process==='cool'?'fridge':'sinkbasin';let action='';
    if(requiresSlice&&!sliceDone){
      if(/^(?:knife|butterknife) /.test(held))action=actions.find(a=>a.startsWith('slice '+target+' '))||(targetPlace&&actions.find(a=>a==='go to '+targetPlace))||'';
      else if(held)action=actions.find(a=>a.startsWith('put '+held+' in/on '))||'';
      else action=actions.find(a=>/^take (?:knife|butterknife) /.test(a))||(knifePlace&&actions.find(a=>a==='go to '+knifePlace))||'';
    }else if(requiresSlice&&/^(?:knife|butterknife) /.test(held)){
      action=actions.find(a=>a.startsWith('put '+held+' in/on '))||'';
    }else if(hasTarget){
      if(!done)action=actions.find(a=>a.startsWith(process+' '+held+' with '))||actions.find(a=>a.startsWith('open '+station+' '))||actions.find(a=>a.startsWith('go to '+station+' '))||'';
      else action=actions.find(a=>a.startsWith('put '+held+' in/on '+destination+' '))||actions.find(a=>a.startsWith('open '+destination+' '))||actions.find(a=>a.startsWith('go to '+destination+' '))||'';
    } else action=actions.find(a=>a.startsWith('take '+target+' '))||(targetPlace&&actions.find(a=>a==='go to '+targetPlace))||'';
    if(!action)action=actions.find(a=>a.startsWith('open '))||actions.filter(a=>a.startsWith('go to ')&&!checked.has(a.slice(6))).sort((a,b)=>searchRank(a)-searchRank(b))[0]||'';
    releaseKnifeAction=requiresSlice&&sliceDone&&/^(?:knife|butterknife) /.test(held)&&action.startsWith('put ')?action:'';
    const confirmed=[...properties].filter(([obj,p])=>obj.startsWith(target+' ')&&p[process]).map(([obj])=>obj);
    const annotation=`Processing state: target=${target}; required=${process}; destination=${destination}; carrying=${held||'nothing confirmed'}; confirmed ${process} objects=${confirmed.join(', ')||'none'}. ${action?'Next useful AVAILABLE ACTION: '+action+'. ':''}Only actual receipts confirm state. ${hasTarget&&!done?'Processing is still unconfirmed; do it before final placement.':''}`;
    latestAdvice='Current confirmed carrying: '+(held||'nothing')+'. '+(action?'Immediate next action: '+action+'.':'Continue target search.');
    audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
    return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  });
});}
