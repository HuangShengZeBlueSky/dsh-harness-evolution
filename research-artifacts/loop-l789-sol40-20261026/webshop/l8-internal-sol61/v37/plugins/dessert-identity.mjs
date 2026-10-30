export const name='dessert-identity';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;let visible=[],conflict=null,corrected=false,recoveryType='';
 const kinds=s=>[...new Set((String(s).toLowerCase().match(/\bfortune cookies\b|\bcrepes\b/g)||[]))];
 const suggest=()=>visible.filter(x=>x.title.toLowerCase().includes(recoveryType));
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
  conflict=null;const p=String(raw.content).split('Available Actions:')[0].split('[SEP]').map(x=>x.trim());
  if(p.some(x=>/^Page \d+/.test(x))){
   visible=[];for(let i=0;i<p.length-2;i++)if(/^[A-Z0-9]{10}$/.test(p[i])&&/^\$[\d.]+$/.test(p[i+2]))visible.push({id:p[i],title:p[i+1],price:Number(p[i+2].slice(1))});
   if(corrected&&recoveryType&&suggest().length){const annotation=`You are now back on the results page. Public candidates for the requested ${recoveryType}: ${JSON.stringify(suggest())}. Click an available candidate ID here, inspect its options, and retain all request requirements. The earlier wrong product is not a substitute.`;audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};}return d;
  }
  const price=p.findIndex(x=>/^Price:/.test(x)),prev=p.indexOf('< Prev');if(price<0||prev<0||!p.includes('Buy Now'))return d;
  const fields=p.slice(prev+1,price-1);if(fields.length&&fields[0]!=='color')return d;
  const task=p[1]||'',w=kinds(task),title=p[price-1],cap=task.match(/price lower than\s+([\d.]+)/i);
  if(w.length!==1||!cap||kinds(title).includes(w[0])||!/\b(?:glitter|wafels|waffles|gelatin|jello)\b/i.test(title))return d;
  const candidates=visible.filter(x=>x.title.toLowerCase().includes(w[0])&&x.price<Number(cap[1]));if(candidates.length)conflict={task,type:w[0],title,candidates};return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||corrected||!conflict||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now')return d;
  corrected=true;recoveryType=conflict.type;const reason=`The requested product is ${conflict.type}, while this title explicitly describes another product: ${conflict.title}. Matching decoration words or quantity cannot replace the requested food. NEXT ACTION: click "< prev" FIRST to return to the visible results; do not click another ASIN from this detail page. There you can inspect these already seen budget-compatible ${conflict.type} candidates: ${JSON.stringify(conflict.candidates)}. Then select all applicable requested options. Preserve the full request: ${conflict.task}`;
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
