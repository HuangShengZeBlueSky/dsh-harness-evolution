import {sync,product,add,priceBounds,budgetCandidates} from '../lib/visible-v28.mjs';
export const name='budget-search';
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{
 await next();add(p,name,()=> '');let attempts=0,recoveries=0,busy=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  attempts++;const decision=await next();if(decision.kind!=='allow')return decision;
  const state=sync(p),arg=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const value=String(arg?.value||'').toLowerCase(),original=state.products[value],bounds=priceBounds(original?.price);
  if(busy||call.name!=='click_action'||state.page!=='results'||!state.available.includes(value)||!original||!bounds||!state.limit||bounds.min<=state.limit||attempts>15||state.modelCalls>18||recoveries>=(config.maxRecoveries||1)||call.signal.aborted)return decision;
  const chosen=budgetCandidates(state,state.available.filter(x=>/^b[a-z0-9]{9}$/i.test(x)))[0];if(!chosen)return decision;
  recoveries++;busy=true;let raw,outcome;const childId=call.callId+':budget-search:'+recoveries;
  try{outcome=await p.ac.tools.execute({callId:childId,rootCallId:call.rootCallId||call.callId,parent:call.token,name:'click_action',arguments:{value:chosen.id},agent:call.agent||p.agent,signal:call.signal});raw=p.getRawBusinessResult(childId);}finally{busy=false;}
  if(!raw||raw.error||outcome.isError)return decision;
  p.audit({method_id:name,hook:'tools/native-budget-search',decision:'executed',call_id:childId,parent_call_id:call.callId,value:chosen.id,attempts});
  const reason='The proposed search result costs '+original.price+', above the requested '+state.limit+'. Opened this actual visible alternative below the limit instead: '+chosen.title+'. This is not a purchase. CURRENT ACTUAL OBSERVATION:\n'+String(raw.content)+'\nVerify all original identity, feature and option requirements on this product; if they match, complete its selections and buy. Otherwise continue the search. This early price recovery is limited to once.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
