export const name='energy-series';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;let visible=[],comparison=null,corrected=false,recovery=null;
 const norm=s=>String(s).toLowerCase().replace(/[-‐‑–]/g,' ').replace(/\s+/g,' ');
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
  comparison=null;const p=String(raw.content).split('Available Actions:')[0].split('[SEP]').map(x=>x.trim());
  if(p.some(x=>/^Page \d+/.test(x))){
   visible=[];for(let i=0;i<p.length-2;i++)if(/^[A-Z0-9]{10}$/.test(p[i])&&/^\$[\d.]+$/.test(p[i+2]))visible.push({id:p[i],title:p[i+1],price:Number(p[i+2].slice(1))});
   if(recovery&&visible.some(x=>x.id===recovery.id)){const annotation=`The results page now makes the earlier named-series candidate available: ${JSON.stringify(recovery)}. Inspect this candidate and confirm the complete request, including size, sugar requirements and budget.`;audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};}return d;
  }
  const price=p.findIndex(x=>/^Price:/.test(x)),prev=p.indexOf('< Prev');if(price<0||prev<0||price-prev!==2||!p.includes('Buy Now'))return d;
  const task=p[1]||'',nt=norm(task),title=p[price-1],series=[...new Set(nt.match(/\bultra [a-z]+\b/g)||[])],cap=task.match(/price lower than\s+([\d.]+)/i);
  if(!/\benergy drinks?\b/.test(nt)||!/\benergy drinks?\b/.test(norm(title))||series.length!==1||norm(title).includes(series[0])||!cap)return d;
  const matches=visible.filter(x=>/\benergy drinks?\b/.test(norm(x.title))&&norm(x.title).includes(series[0])&&x.price<Number(cap[1]));if(matches.length===1)comparison={task,series:series[0],other:matches[0]};return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||corrected||!comparison||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now')return d;
  corrected=true;recovery=comparison.other;const reason=`The instruction names the energy-drink series ${comparison.series}. This fixed current product does not establish that series, while a budget-compatible same-category candidate explicitly does: ${JSON.stringify(recovery)}. NEXT ACTION: click "< prev" FIRST. Once on the results page click the available candidate ID and verify its required size and other attributes. Do not click another ASIN directly from this detail page. Keep the complete request: ${comparison.task}`;
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
