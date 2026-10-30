export const name='laptop-evidence';
const norm=s=>' '+String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit},next)=>{
  await next();let alternative=null,budget=0,page='',currentTitle='',currentPrice=0,blocked=false,routeTarget='',routed=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;
   if(call.name==='click_action'&&page==='product'&&routeTarget&&String(call.arguments.value).toLowerCase()===routeTarget&&!routed){
    const intended=call.arguments.value;call.arguments={...call.arguments,value:'< prev'};routed=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,annotation:'Legal budget recovery route: requested '+intended+' from product page; executed < prev first. Select the visible candidate from the actual results next.'});
   }
   if(call.name==='click_action'&&String(call.arguments.value).toLowerCase()==='buy now'&&page==='product'&&alternative&&currentTitle!==alternative.title&&budget&&currentPrice>=budget&&!blocked){
    blocked=true;routeTarget=alternative.value;const reason='The actual current price '+currentPrice+' exceeds the required below '+budget+'. A visible laptop matches primary CPU/RAM and listed budget: '+JSON.stringify(alternative)+'. NEXT click_action value "< prev" FIRST. From the actual result page, inspect '+alternative.value+'. Verify the requested SSD really exists, select all exact options, and confirm actual price; do not substitute specs.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }return decision;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||result.isError)return decision;
   const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
   if(raw.includes('Price:')&&raw.includes('[SEP] Buy Now')){page='product';const parts=raw.split('[SEP]').map(x=>x.trim());const at=parts.findIndex(x=>x.startsWith('Price:'));currentTitle=parts[at-1];currentPrice=Number(parts[at].match(/\$([\d,.]+)/)?.[1]?.replaceAll(',',''));if(alternative&&currentTitle===alternative.title)routeTarget='';return decision;}
   if(!raw.includes('Total results:')){page='other';return decision;}page='results';currentPrice=0;alternative=null;
   const task=(raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'').toLowerCase().replace(/\bgig(?:abytes?)?\b/g,'gb');if(!/\blaptop\b/.test(task))return decision;
   const cpu=task.match(/\bi[3579]\b/)?.[0],ram=task.match(/\b(\d+)\s*gb\s*(?:ddr\d|ram)\b/)?.[1],limit=task.match(/price\s+(?:lower|less)\s+than\s*\$?([\d.]+)/)?.[1];
   if(!cpu||!ram||!limit)return decision;budget=Number(limit);
   const ddr=task.match(/\bddr\d\b/)?.[0];const touch=/touch\s*screen/.test(task),quad=/quad[ -]?core/.test(task);const storage=task.match(/\b(\d+)\s*(gb|tb)\s*(?:pcie\s*)?ssd\b/)?.[0]||'';
   const tokens=raw.split('[SEP]').map(x=>x.trim());const matches=[];
   for(let i=0;i<tokens.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(tokens[i])){
    const title=tokens[i+1],price=tokens[i+2],lower=title.toLowerCase();if(!/\blaptop\b/.test(lower))continue;
    const primary=lower.match(/\bi[3579]\b/)?.[0],memory=lower.match(/\b(\d+)\s*gb\s*(?:ddr\d\s*)?ram\b/)?.[1],low=price.match(/\$([\d,.]+)/)?.[1];
    if(primary!==cpu||memory!==ram||!low||Number(low.replaceAll(',',''))>=Number(limit))continue;
    if(ddr&&!norm(title).includes(norm(ddr)))continue;if(touch&&!/touch\s*screen/.test(lower))continue;if(quad&&!/quad[ -]?core/.test(lower))continue;
    matches.push({value:tokens[i].toLowerCase(),title,price,primary_cpu:primary,ram_gb:memory});
   }
   if(matches.length!==1)return decision;alternative=matches[0];
   const text='Laptop specification evidence: this visible laptop title lists the requested primary '+cpu+' CPU and '+ram+'GB RAM, the requested extra CPU/display terms, and a displayed price below '+limit+': '+JSON.stringify(matches[0])+'. Inspect this candidate first. '+(storage?'The instruction also requires '+storage+'. ':'')+'The title may show only a default storage variant: verify the actual capacity options and price; do not assume the requested SSD exists. A CPU mentioned only in a comparison is not the primary CPU.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...decision,content:[...(decision.content||result.content),{type:'text',text}]};
  });
 });
}
