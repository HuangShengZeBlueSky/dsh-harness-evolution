import {rawText} from './visible-state.mjs';
import {ledgerFor,observe,priceLimit,textForm} from './public-ledger.mjs';
export const name='purchase-closure';
export function apply(ctx,config={}){ctx.on('benchmark/setup',async({ac,agent,audit,getRawBusinessResult,getVisibleInput},next)=>{
 await next();const s=ledgerFor(agent),start=config.startStep||12;
 ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next(),text='Execute the next function call directly; avoid prose about what you will do. A narrated purchase is not a purchase. Stop comparing when an affordable product meets the original requirements and its required variants are selected. Reserve the final actions for returning from a detail page, clicking pending variants and an actual buy now call. Keep unresolved requirements visible; a purchase receipt does not by itself prove a full match.';audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:28,text,interpolate:false}]};});
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const receipt=getRawBusinessResult(call.callId);if(!receipt||receipt.error||result.isError)return d;observe(s,call,rawText(result,receipt));if(s.done)return d;
 const step=getVisibleInput().step;if(step<start)return d;const left=Math.max(0,20-step),limit=priceLimit(s),rec=s.products.get(s.current);let text='Purchase completion plan at action '+step+' of the fixed 20-call limit; at most '+left+' calls remain. ';
 if(s.page==='detail')text+='Return to the same product now with click_action({value:"< prev"}). Then select any required remaining option and buy; do not try buy now from this detail view.';
 else if(s.page==='product'){
  const notes=(d.content||result.content).filter(b=>b.type==='text').map(b=>b.text).join('\n');const pending=notes.match(/Pending instruction requirements: ([^\n]+)/)?.[1];
  if(rec?.price!==null&&limit!==null&&rec.price>=limit)text+='This product is over the public price limit. Return with < prev to inspect an affordable alternative, leaving an action for purchase.';
  else text+=(pending?'Complete these pending actual option clicks before buying: '+pending:'Keep the recorded required selections. If this product satisfies the original requirements, make the real click_action({value:"buy now"}) now.')+' Avoid restarting broad searches or reopening already read details. Any unverified feature remains unverified; do not declare full success based only on option selection.';
 }else if(s.page==='results'){
  const terms=[...new Set(textForm(s.task.replace(/and price lower than.*$/i,'')).split(' ').filter(w=>w.length>3&&!['looking','would','should','please','price','dollars','color','sized','choose','with','that','want','need','some','them','size'].includes(w)))];
  const rows=s.rows.filter(r=>limit===null||r.price===null||r.price<limit).map(r=>({...r,coverage:terms.filter(w=>textForm(r.title).includes(w)).length,visited:s.products.has(r.id)})).sort((a,b)=>b.coverage-a.coverage||Number(b.visited)-Number(a.visited));
  text+=(rows.length?'Affordable currently clickable candidates to inspect and finish: '+rows.slice(0,2).map(r=>JSON.stringify({value:r.id})+' '+r.title+(r.visited?' (already inspected; preserve valid selections)':'')).join(' | ')+'. These are title-based inspection candidates, not proven full matches.':'Use the current available page navigation to find an affordable product; preserve enough actions to open and purchase it.')+' Do not repeat a query that exposes the same page.';
 }else text+='Use one focused search for the original product identity, then inspect, select required variants and buy within the remaining actions.';
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};});
});}
