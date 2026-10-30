export const name='pack-count';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;
 let requested=null,actual=null,title='',productPage=false,denied=false;
 const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12};
 const count=s=>{const n='(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve)';
  const m=s.match(new RegExp('\\b'+n+'[ -]+pack\\b','i'))||s.match(new RegExp('\\bpack of '+n+'\\b(?![ -]*(?:ounce|oz|pound|lb|ml|fl)\\b)','i'))||s.match(new RegExp('\\bset of '+n+'\\b','i'))||s.match(new RegExp('\\b'+n+'[ -]+count\\b','i'));
  return m?(words[m[1].toLowerCase()]||Number(m[1])):null;};
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept')return decision;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
  const text=raw.content;
  if(call.name==='search_action'){title='';actual=null;}
  const task=text.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';
  if(task){requested=count(task);if(requested===null){const m=task.match(/\b(two|three|four|five|six|seven|eight|nine|ten|twelve)\b(?=.{0,70}\bcables\b)/i);if(m)requested=words[m[1].toLowerCase()];}}
  productPage=(text.split('Available Actions:')[1]||'').includes("'buy now'");
  if(!productPage)return decision;
  const parts=text.split('Observation:')[1].split('Available Actions:')[0].split('[SEP]').map(x=>x.trim());const now=parts[parts.findIndex(x=>x.startsWith('Price:'))-1]||'';
  if(now!==title){title=now;actual=count(title);}
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(call.name==='click_action'&&count(args.value||'')!==null)actual=count(args.value);
  return decision;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||denied||!productPage||requested===null||actual===null||requested===actual||call.name!=='click_action')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now')return decision;
  denied=true;const reason='Purchase not executed: the request specifies '+requested+' per pack, while the displayed product or executed pack selection is '+actual+'. Select an actual displayed '+requested+'-pack option if available. Otherwise click < prev or back to search for the same item in the required pack count, preserving all other requested attributes.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
 });
});}
