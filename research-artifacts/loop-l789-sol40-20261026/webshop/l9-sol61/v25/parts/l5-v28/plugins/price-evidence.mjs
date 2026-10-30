import {norm,tokens,memory,sync,observe,product,evidence,missing,fit,ranking,pending,add,structuredLedger,brandAnchor,priceBounds,budgetCandidates} from '../lib/visible-v25.mjs';
export const name='price-evidence';
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{await next();const denials={};const render=s=>{if(config.phaseOnly && !(!!product(s) && !!s.limit))return '';const text=(()=>{const q=product(s);if(config.warnOnly){const price=Number(String(q?.price||'').match(/\d+(?:\.\d+)?/)?.[0]);if(!Number.isFinite(price)||!s.limit||price<s.limit)return '';}return `PRICE EVIDENCE\nRequested price strictly below ${s.limit??'unspecified'}. ${q?'Current public price: '+q.price:'No product price confirmed.'}\nA low price cannot replace the requested product identity or feature. A visible range is not a verified selected-variant price; use the actual displayed evidence. Do not purchase a clearly over-budget item when an eligible product is available.`;})();return config.concise?text.split('\n').slice(0,2).join('\n'):text;};if(!config.recoverBudget){add(p,name,render,(s,call)=>{const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const q=product(s);if(!config.gate||call.name!=='click_action'||a?.value?.toLowerCase()!=='buy now'||!q||!s.limit||!s.available.includes('buy now')||s.step>=16)return;const price=Number(String(q.price).match(/\d+(?:\.\d+)?/)?.[0]);if(price>=s.limit&&!denials[s.current]){denials[s.current]=1;return 'Visible price '+q.price+' is not below the requested '+s.limit+'. Click < prev to compare a product below the limit, or back to search for the requested item.';}});return;}
  let attempts=0,serial=0,recoveries=0,busy=false;add(p,name,()=> '');
  async function run(call,value){
   const childId=call.callId+':budget:'+String(++serial);
   const outcome=await p.ac.tools.execute({callId:childId,rootCallId:call.rootCallId||call.callId,parent:call.token,name:'click_action',arguments:{value},agent:call.agent||p.agent,signal:call.signal});
   const raw=p.getRawBusinessResult(childId);
   if(!raw||raw.error||outcome.isError)return null;
   p.audit({method_id:name,hook:'tools/native-budget',decision:'executed',call_id:childId,parent_call_id:call.callId,value,attempts});return raw;
  }
  p.ac.on('tools/pre-execute',async(call,next)=>{
   attempts++;const decision=await next();if(decision.kind!=='allow')return decision;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;let state=sync(p);const q=product(state);const bounds=priceBounds(q?.price);
   if(busy||call.name!=='click_action'||a?.value?.toLowerCase()!=='buy now'||!q||!state.available.includes('buy now')||!state.limit||!bounds||bounds.min<=state.limit)return decision;
   if(attempts<=14&&state.modelCalls<=18&&recoveries<(config.maxRecoveries||1)&&state.available.includes('< prev')&&budgetCandidates(state).length&&!call.signal.aborted){
    recoveries++;busy=true;let chosen=null,receipt=null;
    try{
     const back=await run(call,'< prev');
     if(back){state=sync(p);chosen=budgetCandidates(state,state.available.filter(x=>/^b[a-z0-9]{9}$/i.test(x)))[0];if(chosen)receipt=await run(call,chosen.id);}
    }finally{busy=false;}
    state=sync(p);const reason=receipt?'The original product price '+q.price+' exceeds '+state.limit+'. Opened a publicly observed alternative below the limit: '+chosen.title+' at '+chosen.price+'. This is NOT a purchase. CURRENT ACTUAL OBSERVATION:\n'+String(receipt.content)+'\nVerify all original identity/features and requested options on this actual product, then buy only if it meets the task.':'The original item exceeds the requested price. Recovery returned toward search results. Current actual legal values: '+state.available.join(' | ')+'. Choose an item matching every requirement below the limit, then complete its options and buy.';
    p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }
   if(attempts<18&&state.modelCalls<19&&!denials[q.id]){denials[q.id]=1;const reason='The public price '+q.price+' is above the requested '+state.limit+'. Click < prev to compare an item below the limit, or back to search for the requested product. Do not replace identity or features merely to obtain a low price.';p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
   return decision;
  });
 });}
