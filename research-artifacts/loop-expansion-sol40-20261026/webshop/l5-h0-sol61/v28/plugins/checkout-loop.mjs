import {norm,tokens,memory,sync,observe,product,evidence,missing,fit,ranking,pending,add,structuredLedger,brandAnchor} from '../lib/visible.mjs';
export const name='checkout-loop';
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{await next();const denials={};const render=s=>{if(config.phaseOnly && !(s.available.includes('buy now') && pending(s,config).length>0))return '';const text=(()=>{const todo=pending(s,config);return `PURCHASE CHECKPOINT\n${todo.length?'Before buy now, select requested options: '+todo.map(x=>x.value).join(' -> '):'No explicit matching option is pending. If the product meets the request and price, call click_action with buy now.'}\nTask completion requires a real successful purchase receipt. Do not stop with prose, do not keep reselecting confirmed options. Steps used: ${s.step}/20.`;})();return config.concise?text.split('\n').slice(0,2).join('\n'):text;};if(!config.auto){add(p,name,render,(s,call)=>{const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(call.name!=='click_action'||a?.value?.toLowerCase()!=='buy now'||!s.available.includes('buy now')||s.step>=(config.release||17))return;const todo=pending(s,config);const k=s.current||'page';if(todo.length&&(denials[k]||0)<(config.maxDenials||1)){denials[k]=(denials[k]||0)+1;return 'Requested option is not yet selected. Next call click_action with value '+JSON.stringify(todo[0].value)+', then complete the remaining requested options and buy now.';}});return;}
  let attempts=0,serial=0,busy=false;
  const autoRender=s=>{
   if(!config.delegate)return render(s);
   if(!s.available.includes('buy now'))return '';
   const requested=pending(s,{...config,exact:true,compound:true,threshold:10}).filter(x=>x.alternatives.length===1&&s.available.includes(x.value));
   const room=Math.max(0,Math.min(config.maxAutoOptions||3,20-attempts-1));
   if(!requested.length||!room)return '';
   const planned=requested.slice(0,room);
   const manual=config.manualFirst?pending(s,{...config,exact:false,compound:true,threshold:0.4}).filter(x=>!planned.some(y=>y.group===x.group)):[];
   if(manual.length)return `MANUAL OPTION RESOLUTION\nSelect the remaining requested choices before buy now: ${manual.map(x=>x.group+': '+x.alternatives.map(v=>JSON.stringify(v)).join(' or ')).join('; ')}. Several equally matching values are ambiguous; resolve them using the instruction and product evidence. After those choices, the controller can confirm the unique exact matches during checkout. Actual selected: ${JSON.stringify(s.selected)}.`;
   const plan=planned.map(x=>x.group+': '+JSON.stringify(x.value));
   return `NATIVE CHECKOUT PLAN\nExact requested choices that this controller can confirm before purchase: ${plan.join('; ')}.\nIf the current product identity, features and price meet the original request, call click_action with value buy now. The controller will select these unambiguous available options through the real tool pipeline before executing that purchase. ${requested.length>room?'Additional requested choices remain; select them first.':''}\nAll option calls share the same 20-action limit. Actual selections already made: ${JSON.stringify(s.selected)}. Do not buy a wrong product merely because its options match.`;
  };
  add(p,name,autoRender);
  p.ac.on('tools/pre-execute',async(call,next)=>{
   attempts++;
   const decision=await next();if(decision.kind!=='allow')return decision;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   let state=sync(p);
   if(busy||call.name!=='click_action'||a?.value?.toLowerCase()!=='buy now'||!state.available.includes('buy now'))return decision;
   if(config.manualFirst&&attempts<18){
    const planned=pending(state,{...config,exact:true,compound:true,threshold:10}).filter(x=>x.alternatives.length===1&&state.available.includes(x.value)).slice(0,Math.min(config.maxAutoOptions||3,20-attempts));
    const manual=pending(state,{...config,exact:false,compound:true,threshold:0.4}).filter(x=>!planned.some(y=>y.group===x.group));
    const key=state.current+':manual';
    if(manual.length&&!denials[key]){denials[key]=1;const reason='Resolve the requested option '+manual[0].group+' first: choose '+manual[0].alternatives.map(v=>JSON.stringify(v)).join(' or ')+'. Then click buy now for the remaining unique native confirmations.';p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
   }
   const selected=[];busy=true;
   try{
    for(let n=0;n<(config.maxAutoOptions||3)&&attempts<20&&!call.signal.aborted;n++){
     state=sync(p);
     const item=pending(state,{...config,exact:true,compound:true,threshold:10}).find(x=>x.alternatives.length===1&&state.available.includes(x.value));
     if(!item)break;
     const childId=call.callId+':option:'+String(++serial);
     const outcome=await p.ac.tools.execute({callId:childId,rootCallId:call.rootCallId||call.callId,parent:call.token,name:'click_action',arguments:{value:item.value},agent:call.agent||p.agent,signal:call.signal});
     const raw=p.getRawBusinessResult(childId);
     if(!raw||raw.error||outcome.isError)break;
     p.audit({method_id:name,hook:'tools/auto-confirm',decision:'executed',call_id:childId,parent_call_id:call.callId,value:item.value,group:item.group,attempts});
     selected.push(item.value);
    }
   }finally{busy=false;}
   if(selected.length)p.audit({method_id:name,hook:'tools/pre-execute',decision:'allow',call_id:call.callId,auto_selected:selected,attempts});
   return decision;
  });
 });}
