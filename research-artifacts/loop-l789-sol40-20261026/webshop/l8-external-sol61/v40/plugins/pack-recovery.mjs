export const name='pack-recovery';
const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
const number='(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const amount=s=>words[String(s).toLowerCase()]||Number(s);
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit},next)=>{
  await next();let conflict='',query='',prompted=false,blocked=false,focused=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;
   if(call.name==='search_action'&&query&&!focused){const original=call.arguments.keywords;call.arguments={...call.arguments,keywords:query};query='';focused=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,annotation:'Explicit pack recovery search: '+JSON.stringify({original,executed:call.arguments.keywords})});}
   if(call.name==='click_action'&&String(call.arguments.value).toLowerCase()==='buy now'&&conflict&&!blocked){blocked=true;const reason=conflict+' NEXT click_action value "back to search", then search for the required pack count and exact original product type. Keep length, connector direction, all features and budget.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return decision;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||result.isError)return decision;
   const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');conflict='';if(!raw.includes('Price:')||!raw.includes('[SEP] Buy Now'))return decision;
   const task=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';if(!/\bcables?\b/i.test(task)||!/\b(?:hdmi|usb|coaxial)\b/i.test(task)||!new RegExp('\\b'+number+'\\s*(?:foot|feet|ft)\\b','i').test(task))return decision;const countMatch=task.match(new RegExp('\\bpack\\s+of\\s+'+number+'\\b','i'))||task.match(new RegExp('\\b'+number+'[-\\s]+packs?\\b','i'));if(!countMatch)return decision;const wanted=amount(countMatch[1]);
   const tokens=raw.split('[SEP]').map(x=>x.trim());const p=tokens.findIndex(x=>x.startsWith('Price:')),start=tokens.findIndex(x=>x.toLowerCase()==='size');if(start<0)return decision;
   const options=[];for(const x of tokens.slice(start+1,p-1)){if(['color','style','flavor','flavor name','material type','capacity','fit type'].includes(x.toLowerCase()))break;options.push(x);}
   const counts=options.map(s=>s.match(/\bpack\s+of\s*(\d+)\b/i)?.[1]||s.match(/\b(\d+)\s*(?:pk|packs?|counts?)\b/i)?.[1]);if(!options.length||counts.some(x=>!x)||counts.some(x=>Number(x)===wanted)){query='';return decision;}
   conflict='The task requires a pack of '+wanted+', but every visible size option has one of these explicit counts: '+JSON.stringify([...new Set(counts.map(Number))])+'. Matching a cable length or an ounce value does not satisfy the pack count.';
   const length=task.match(new RegExp('\\b'+number+'\\s*(?:foot|feet|ft)\\b','i'));const head=task.replace(/(?:and\s+)?price\s+(?:lower|less)\s+than[\s\S]*$/i,'').split(/[.!?](?:\s|$)/)[0].replace(/^(?:i\s+)?(?:need|want|would like)\s+(?:to\s+)?(?:buy\s+)?(?:some|a|an)?\s*/i,'').trim();
   if(!focused)query=wanted+' pack '+(length?amount(length[1])+' foot ':'')+head;if(prompted)return decision;prompted=true;
   const text=conflict+' NEXT click_action value "back to search", then search_action keywords '+JSON.stringify(query)+'. This is a candidate-discovery query: still verify every required property and actual selected quantity before buying.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...decision,content:[...(decision.content||result.content),{type:'text',text}]};
  });
 });
}
