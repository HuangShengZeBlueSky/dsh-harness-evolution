export const name='cable-count';
export function apply(ctx){
 ctx.on('benchmark/setup',async(payload,next)=>{
  await next();const {ac,audit,getRawBusinessResult}=payload;
  let conflict=null,corrected=false;
  const words='one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
  const normalize=s=>s.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g,w=>String(words.indexOf(w)+1));
  const packs=s=>[...new Set([...normalize(s).matchAll(/\b(?:pack|set)\s+of\s+(\d+)\b|\b(\d+)\s*[- ]?\s*(?:packs?|pk)\b/g)].map(m=>Number(m[1]||m[2])))];
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept')return decision;
   const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
   conflict=null;const parts=String(raw.content).split('Available Actions:')[0].split('[SEP]').map(s=>s.trim());
   const price=parts.findIndex(s=>/^Price:/.test(s)),prev=parts.findIndex(s=>s==='< Prev');
   if(price<0||prev<0||!parts.includes('Buy Now')||price-prev!==2)return decision;
   const task=parts[1]||'',type=task.match(/\b(hdmi|usb|coaxial)\b/i)?.[1];
   if(!type||! /\bcables?\b/i.test(task))return decision;
   let counts=packs(task);
   if(!counts.length){
    const text=normalize(task).replace(/\b\d+(?:\.\d+)?\s*(?:ft|feet|foot|meters?|inches|inch|cm|mm)\b/g,'');
    counts=[...new Set([...text.matchAll(/\b(?:for|need|want|buy|find)\s+(\d+)\s+[^.!?]{0,90}?\bcables?\b/g)].map(m=>Number(m[1])))];
   }
   const actual=packs(parts[price-1]);
   if(counts.length===1&&actual.length===1&&counts[0]!==actual[0])conflict={wanted:counts[0],actual:actual[0],type};
   return decision;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const result=await next();if(result.kind!=='allow'||corrected||!conflict||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now')return result;
   corrected=true;
   const reason=`The instruction requires ${conflict.wanted} ${conflict.type} cables, but this fixed product title says ${conflict.actual}-pack and has no quantity options. Return to results or search '${conflict.wanted} pack ${conflict.type} cable'. Keep every other required feature, length, color and budget; buy a matching package rather than assuming multiple units can be added.`;
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
