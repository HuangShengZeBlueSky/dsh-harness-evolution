export const name='bedding-size';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;
 let wanted='',title='',actual='',options=[],productPage=false,denied=false;
 const size=s=>s.toLowerCase().match(/\b(twin|full|queen|king)\b/)?.[1]||'';
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept')return decision;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
  const text=raw.content,args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const task=text.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';wanted=/bed|sheet|comforter/i.test(task)?size(task):'';
  const actions=text.split('Available Actions:')[1]||'';productPage=actions.includes("'buy now'");if(!productPage)return decision;
  const parts=text.split('Observation:')[1].split('Available Actions:')[0].split('[SEP]').map(x=>x.trim()),now=parts[parts.findIndex(x=>x.startsWith('Price:'))-1]||'';
  if(now!==title){title=now;actual=size(title);}
  options=parts.filter(x=>size(x)&&actions.includes("'"+x.toLowerCase()+"'"));
  if(call.name==='click_action'&&options.some(x=>x.toLowerCase()===(args.value||'').toLowerCase()))actual=size(args.value);
  return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||denied||!productPage||!wanted||!actual||actual===wanted||call.name!=='click_action')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now')return decision;
  denied=true;const matches=options.filter(x=>size(x)===wanted);
  const reason='Purchase not executed: requested bedding size is '+wanted+', but current listing or executed size choice is '+actual+' in '+JSON.stringify(title)+'. '+(matches.length?'Choose the actual requested size option '+JSON.stringify(matches)+'.':'This listing offers no displayed '+wanted+' size. Search again for the original brand and character/theme in '+wanted+' bed set; keep softness and budget. Do not substitute full for twin or another bedding size.')+' Then select only requested actual options before buying.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
 });
});}
