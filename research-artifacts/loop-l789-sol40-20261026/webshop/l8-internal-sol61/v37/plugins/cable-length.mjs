export const name='cable-length';
const lengths=text=>[...new Set([...String(text).matchAll(/(\d+(?:\.\d+)?)\s*(?:ft|feet|foot)\b/gi)].map(m=>Number(m[1])))];
export function apply(ctx) {
  ctx.on('benchmark/setup',async(payload,next)=>{
    await next();const {ac,audit,getRawBusinessResult}=payload;
    let chosen=null,options=new Set(),onProduct=false,conflict=null,corrected=false,currentId=null,requestedType=null;
    const excluded=new Set();
    ac.on('tools/post-execute',async(call,result,next)=>{
      const decision=await next();if(decision.kind!=='accept')return decision;
      const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return decision;
      const value=String(call.arguments?.value||'').toLowerCase();
      if(/^[a-z0-9]{10}$/.test(value))currentId=value;
      else if(call.name==='search_action'||['back to search','< prev','next >'].includes(value))currentId=null;
      if(call.name==='search_action'||/^[a-z0-9]{10}$/.test(value)||value==='back to search'){chosen=null;options=new Set();}
      else if(onProduct&&options.has(value)) {const ns=lengths(value);if(ns.length)chosen=ns.length===1?ns[0]:null;}
      const parts=String(raw.content).split('Available Actions:')[0].trim().split('[SEP]').map(x=>x.trim());
      const prev=parts.findIndex(x=>x.toLowerCase()==='< prev');const price=parts.findIndex(x=>x.startsWith('Price:'));
      onProduct=prev>=0&&price>prev&&parts.some(x=>x.toLowerCase()==='buy now');conflict=null;
      if(!onProduct) {
        if(corrected&&requestedType&&parts.some(x=>/^Page \d+/i.test(x))) {
          const typePattern=requestedType==='coaxial'?/\b(?:coaxial|coax|rg[- ]?6|rg[- ]?11)\b/i:requestedType==='hdmi'?/\bhdmi\b/i:/\busb\b/i;
          const candidates=[];
          for(let i=0;i<parts.length-2;i++)if(/^[a-z0-9]{10}$/i.test(parts[i])&&/^\$/.test(parts[i+2])&&!excluded.has(parts[i].toLowerCase())&&typePattern.test(parts[i+1]))candidates.push({id:parts[i].toLowerCase(),title:parts[i+1],price:parts[i+2]});
          const annotation=`Cable recovery: keep the original ${requestedType} cable type, required length and pack quantity. Previously inspected products without the required length: ${JSON.stringify([...excluded])}. Unexcluded visible titles matching this cable type (inspect actual options; title length may be a default): ${JSON.stringify(candidates)}. ${candidates.length?'Inspect a suitable same-type candidate and select the actual required length.':parts.includes('Next >')?"No unexcluded same-type candidate is visible on this page. Click 'next >' to inspect more results instead of repeating this page or buying another cable type.":'Search again for the required length and cable type.'} Retain the other required properties and budget.`;
          audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
          return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
        }
        return decision;
      }
      options=new Set(parts.slice(prev+1,price-1).map(x=>x.toLowerCase()));
      const task=parts[1]||'';
      if(!/\bcables?\b/i.test(task)||!/(?:coaxial|hdmi|usb)/i.test(task))return decision;
      requestedType=/coaxial/i.test(task)?'coaxial':/hdmi/i.test(task)?'hdmi':'usb';
      const wanted=lengths(task),title=parts[price-1],ns=chosen===null?lengths(title):[chosen];
      if(wanted.length===1&&ns.length===1&&wanted[0]!==ns[0])conflict={wanted:wanted[0],current:ns[0],canSelect:[...options].some(v=>lengths(v).includes(wanted[0]))};
      return decision;
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const result=await next();
      if(result.kind!=='allow'||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now'||!conflict||corrected)return result;
      corrected=true;
      if(currentId&&!conflict.canSelect)excluded.add(currentId);
      const reason=`The requested cable length is ${conflict.wanted} ft, but the current selected length or fixed product title is ${conflict.current} ft. Select the exact requested length if available. Otherwise click '< prev' or 'back to search' and find a cable with the required length, type and pack quantity; do not buy the known wrong length.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
    });
  });
}
