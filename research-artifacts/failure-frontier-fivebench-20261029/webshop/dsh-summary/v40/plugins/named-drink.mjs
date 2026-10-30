export const name='named-drink';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;
 let wanted='',title='',productPage=false,rows=[],denied=false;
 const norm=s=>s.toLowerCase().replace(/[-–]/g,' ').replace(/\s+/g,' ').trim();
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept')return decision;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
  const text=raw.content,task=text.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';
  const m=norm(task).match(/\b(?:a|an)\s+(?:\d+(?:\.\d+)?\s+(?:ounce|oz)\s+)?([a-z]+(?: [a-z]+){0,2}) sugar free energy drink\b/);wanted=m?.[1]||'';
  const actions=text.split('Available Actions:')[1]||'';productPage=actions.includes("'buy now'");
  const parts=text.split('Observation:')[1]?.split('Available Actions:')[0].split('[SEP]').map(x=>x.trim())||[];
  if(productPage)title=parts[parts.findIndex(x=>x.startsWith('Price:'))-1]||'';
  if(parts.some(x=>x.startsWith('Page '))){rows=[];for(let i=0;i<parts.length-2;i++)if(/^[A-Z0-9]{10}$/.test(parts[i])&&parts[i+2].startsWith('$'))rows.push({id:parts[i].toLowerCase(),title:parts[i+1]});}
  return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||denied||!productPage||!wanted||call.name!=='click_action')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now'||norm(title).includes(wanted))return decision;
  const match=rows.find(x=>norm(x.title).includes(wanted)&&/energy drink/i.test(x.title));if(!match)return decision;
  denied=true;const reason='Purchase not executed: request names '+JSON.stringify(wanted)+' energy drink, but current title is '+JSON.stringify(title)+'. This is a different named drink. A result actually observed on the current search is '+JSON.stringify(match)+'. Click < prev to return to results, then open that exact identifier if still displayed. Keep requested volume, sugar-free requirement and price limit; choose actual requested options before buying.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
 });
});}
