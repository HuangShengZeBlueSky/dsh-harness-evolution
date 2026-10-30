export const name='receipt-ledger';
export function apply(ctx){
 ctx.on('benchmark/setup',async ({ac,audit,getVisibleInput,getRawBusinessResult},next)=>{
  await next();
  let wantSlice=false,initialized=false,goal='',object='',target='',lamp='',required='',held='',location='',destination='',legal=[],denials=0,pickupDeferrals=0;
  const visits=new Map(),places=new Set(),searched=new Set(),objects=new Map(),delivered=new Set(),states=new Map();
  const type=s=>s.split(' ')[0];
  const ready=o=>(!wantSlice||states.get(o)?.sliced)&&(!required||(required==='clean'?states.get(o)?.clean:states.get(o)?.temperature===required));
  const sorted=xs=>xs.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  function actions(text){const x=text.split('AVAILABLE ACTIONS:')[1];if(x!==undefined){legal=x.trim().split('\n').map(s=>s.trim()).filter(Boolean);for(const a of legal)if(a.startsWith('go to '))places.add(a.slice(6));}}
  function init(){if(initialized)return;for(const m of getVisibleInput().messages){const text=String(m.content||'');const x=text.split(' AVAILABLE ACTIONS:')[0].match(/Your task is to:\s*([^\n]+)/i);if(!x)continue;goal=x[1].toLowerCase();const ob=goal.match(/^(?:look at|examine)\s+(?:the\s+)?([a-z]+)/)||goal.match(/^(?:put|find|heat|cool|clean)\s+(?:(?:a|an|some|two|the)\s+)?(?:(?:hot|cold|cool|clean|sliced)\s+)*([a-z]+)/);object=ob?.[1]||'';wantSlice=/\bsliced\b/.test(goal);target=goal.match(/(?:in|on|into)\s+([a-z]+)[.]?\s*$/)?.[1]||'';lamp=goal.match(/\b([a-z]*lamp)\b/)?.[1]||'';required=/\b(hot|heat)\b/.test(goal)?'heat':/\b(cold|cool)\b/.test(goal)?'cool':/\bclean\b/.test(goal)?'clean':'';actions(text);initialized=true;break;}}
  function go(place){return legal.includes('go to '+place)?'go to '+place:legal.includes('open '+place)?'open '+place:'';}
  function search(){
   const opening=legal.find(a=>a.startsWith('open ')&&!searched.has(a.slice(5)));if(opening)return opening;
   const options=[...places].filter(p=>!searched.has(p)&&legal.includes('go to '+p));
   const mugRank=p=>({coffeemachine:0,countertop:0,diningtable:0,fridge:1,microwave:2,cabinet:3,sinkbasin:4,shelf:4,drawer:5}[type(p)]??6);
   options.sort((a,b)=>(['mug','glassbottle'].includes(object)?mugRank(a)-mugRank(b):Number(/^(cabinet|drawer|safe|fridge|microwave) /.test(a))-Number(/^(cabinet|drawer|safe|fridge|microwave) /.test(b)))||a.localeCompare(b,undefined,{numeric:true}));
   return options.length?'go to '+options[0]:'';
  }
  function suggest(){
   if(!object)return '';
   if(wantSlice){
    const slicedKnown=[...objects].filter(([o])=>type(o)===object&&states.get(o)?.sliced&&!delivered.has(o));
    if(held&&/^(knife|butterknife) /.test(held)){
     if(slicedKnown.length)return legal.find(a=>a.startsWith('put '+held+' in/on '))||'';
     const slice=legal.find(a=>a.startsWith('slice '+object+' '));if(slice)return slice;
     for(const [o,p]of objects)if(type(o)===object&&!states.get(o)?.sliced){const a=go(p);if(a)return a;}
     return search();
    }
    if(held&&type(held)===object&&!states.get(held)?.sliced)return legal.find(a=>a.startsWith('put '+held+' in/on '))||'';
    if(!held&&!slicedKnown.length){
     const knife=legal.find(a=>/^take (knife|butterknife) \d+ from /.test(a));if(knife)return knife;
     for(const [o,p]of objects)if(/^(knife|butterknife) /.test(o)){const a=go(p);if(a)return a;}
     return search();
    }
   }
   if(held&&type(held)!==object)return legal.find(a=>a.startsWith('put '+held+' in/on '))||'';
   if(held){
    if(!ready(held)){
     const processing=legal.find(a=>a.startsWith(required+' '+held+' with '));if(processing)return processing;
     const appliance={heat:'microwave',cool:'fridge',clean:'sinkbasin'}[required];
     const place=sorted([...places].filter(p=>type(p)===appliance))[0];return place?go(place):'';
    }
    if(lamp){
     const use=legal.find(a=>a.startsWith('use '+lamp+' '));if(use)return use;
     const light=[...objects].find(([o])=>type(o)===lamp);return light?go(light[1]):search();
    }
    if(!destination)destination=sorted([...places].filter(p=>type(p)===target))[0]||'';
    const put='put '+held+' in/on '+destination;
    if(legal.includes(put))return put;
    return destination?go(destination):'';
   }
   const take=legal.find(a=>a.startsWith('take '+object+' ')&&!delivered.has(a.match(/^take (.+) from /)?.[1])&&(!wantSlice||states.get(a.match(/^take (.+) from /)?.[1])?.sliced));if(take)return take;
   const known=[...objects].filter(([o])=>type(o)===object&&!delivered.has(o)&&(!wantSlice||states.get(o)?.sliced));
   for(const [,p]of known){const a=go(p);if(a)return a;}
   return search();
  }
  function compact(){
   const state=held?states.get(held):null;
   const nextAction=suggest();
   return `Receipt state: goal=${goal}; holding=${held||'nothing'}; required process=${required||'none'};${wantSlice?' require sliced=true;':''} confirmed held-object state=${state?JSON.stringify(state):'unconfirmed'}; valid deliveries=${[...delivered].join(', ')||'none'}.\n${nextAction?'Next exact available action: '+nextAction+'. Call take_action with this action.':'Continue the missing requirement using the latest AVAILABLE ACTIONS; a completion claim is not a tool receipt.'}`;
  }
  ac.on('tools/pre-execute',async (call,next)=>{
   const result=await next();if(result.kind!=='allow')return result;init();
   const action=call.arguments?.action;
   const recovery=suggest();
   const revisit=action?.match(/^go to (.+)$/)?.[1];
   if(!wantSlice&&!held&&revisit&&(visits.get(revisit)||0)>=2&&recovery&&recovery!==action&&!([...objects].some(([o,p])=>type(o)===object&&!delivered.has(o)&&p===revisit))&&denials<4){denials++;const reason=`You have already inspected ${revisit} at least twice without finding an undelivered ${object}. You are holding nothing. Stop repeating that search while other steps remain. Use take_action({"action":${JSON.stringify(recovery)}}).`;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
   const pickup=!held?legal.find(a=>a.startsWith('take '+object+' ')&&!delivered.has(a.match(/^take (.+) from /)?.[1])&&(!wantSlice||states.get(a.match(/^take (.+) from /)?.[1])?.sliced)):'';
   if(pickup&&action?.startsWith('go to ')){
    pickupDeferrals++;
    if(pickupDeferrals>=2&&denials<4){
     denials++;const reason=`You are still carrying nothing and have repeatedly left an available target. Before processing or delivery, use take_action({"action":${JSON.stringify(pickup)}}).`;
     audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
    }
   }
   if(call.name==='take_action'&&legal.length&&!legal.includes(action)&&recovery&&denials<4){
    denials++;const reason=`That action is not in the current AVAILABLE ACTIONS and could execute a different operation. Use take_action({"action":${JSON.stringify(recovery)}}). Confirmed holding: ${held||'nothing'}.`;
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }
   return result;
  });
  ac.on('tools/post-execute',async (call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept')return decision;
   init();const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
   const text=String(raw.content||'');actions(text);const observation=text.split(' AVAILABLE ACTIONS:')[0];
   const listing=observation.match(/^On the ([a-z]+ \d+), you see /)||observation.match(/The ([a-z]+ \d+) is open\. In it, you see /);
   if(listing){location=listing[1];visits.set(location,(visits.get(location)||0)+1);searched.add(location);for(const [o,p]of objects)if(p===location)objects.delete(o);const body=observation.slice(observation.indexOf('you see ')+8);for(const m of body.matchAll(/\b([a-z]+ \d+)\b/g))objects.set(m[1],location);}
   const closed=observation.match(/^The ([a-z]+ \d+) is closed/);if(closed)location=closed[1];
   const take=observation.match(/You pick up the ([a-z]+ \d+) from the ([a-z]+ \d+)/);if(take){held=take[1];if(type(held)===object)pickupDeferrals=0;location=take[2];objects.delete(held);delivered.delete(held);}
   const sliced=observation.match(/You sliced the ([a-z]+ \d+) with the (?:knife|butterknife) \d+/);if(sliced){const state=states.get(sliced[1])||{};state.sliced=true;states.set(sliced[1],state);}
   const processed=observation.match(/You (heat|cool|clean) the ([a-z]+ \d+) using the /);
   if(processed){const state=states.get(processed[2])||{};if(processed[1]==='clean')state.clean=true;else state.temperature=processed[1];states.set(processed[2],state);if(!ready(processed[2]))delivered.delete(processed[2]);}
   const put=observation.match(/You put the ([a-z]+ \d+) in\/on the ([a-z]+ \d+)/);if(put){if(held===put[1])held='';objects.set(put[1],put[2]);location=put[2];if(type(put[1])===object&&type(put[2])===target){if(!destination)destination=put[2];if(put[2]===destination&&ready(put[1]))delivered.add(put[1]);else delivered.delete(put[1]);}else delivered.delete(put[1]);}
   if(observation.includes('You are not carrying anything'))held='';
   const inv=observation.match(/You are carrying: a ([a-z]+ \d+)/);if(inv)held=inv[1];
   if(!object)return decision;
   const annotation=compact();audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  });
  ac.on('system-prompt/assemble',async (assembly,context,next)=>{
   const result=await next();init();if(!initialized||!object)return result;
   const known=[...objects].filter(([o])=>type(o)===object&&!delivered.has(o)&&(!wantSlice||states.get(o)?.sliced));
   const text=compact()+`\nKnown undelivered targets: ${known.map(([o,p])=>o+' at '+p).join('; ')||'none'}.\nContents inspected: ${[...searched].join(', ')||'none'}. Remaining places: ${[...places].filter(p=>!searched.has(p)).join(', ')||'none'}. A closed container is not searched. Heat and cool overwrite each other; only a successful processing receipt establishes that state.`;
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...result,sections:[...result.sections,{name,order:35,text,interpolate:false}]};
  });
 });
}
