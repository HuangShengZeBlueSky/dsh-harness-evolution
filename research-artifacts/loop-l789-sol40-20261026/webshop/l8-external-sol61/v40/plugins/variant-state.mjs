export const name = 'variant-state';
const norm=s=>' '+String(s).toLowerCase().replace(/(\d)\s*["”″]?\s*[x×]\s*(?=\d)/g,'$1 x ').replace(/[^a-z0-9.]+/g,' ').trim()+' ';
const headings = new Set(['style name','design','fit type','material type','size','color','style','flavor name','flavor','scent','configuration','pattern name','item package quantity','number of items','material','model','capacity','unit count','item display length','item display weight','size name','color name']);
export function apply(ctx) {
 ctx.on('benchmark/setup', async (payload,next)=>{
  await next(); const {ac,audit}=payload; let current='',selected={},pending=[],blocked=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const result=await next();if(result.kind!=='allow')return result;
   if(call.name==='click_action'&&String(call.arguments.value).toLowerCase()==='buy now'&&pending.length&&!blocked){
    blocked=true;const reason='Before buying, select the requested option(s): '+pending.map(x=>JSON.stringify(x)).join(', ')+'. Call click_action with these exact values, then buy now.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }return result;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||result.isError)return decision;
   const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
   if(call.name==='search_action'||(call.name==='click_action'&&/^b[a-z0-9]{9}$/i.test(call.arguments.value||''))){selected={};pending=[];blocked=false;current=call.arguments.value||'';}
   if(!raw.includes('Price:')||!raw.includes('[SEP] Buy Now'))return decision;
   const tokens=raw.split('[SEP]').map(x=>x.trim()); const start=tokens.findIndex(x=>x.toLowerCase()==='< prev')+1;const end=tokens.findIndex(x=>x.startsWith('Price:'))-1;
   const groups={};let group='';for(const token of tokens.slice(start,end)){if(headings.has(token.toLowerCase())){group=token.toLowerCase();groups[group]=[];}else if(group)groups[group].push(token);}
   const value=String(call.arguments.value||'').toLowerCase();
   for(const [key,options] of Object.entries(groups))if(options.some(x=>x.toLowerCase()===value))selected[key]=options.find(x=>x.toLowerCase()===value);
   const instruction=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';
   pending=[];for(const [key,options] of Object.entries(groups)){
    const contained=[...new Set(options)].filter(option=>norm(option).trim().length>1&&norm(instruction).includes(norm(option)));
    const matches=contained.filter(a=>!contained.some(b=>norm(b).length>norm(a).length&&norm(b).includes(norm(a))));
    if(matches.length===1&&selected[key]!==matches[0])pending.push(matches[0]);
   }
   if(!Object.keys(groups).length)return decision;
   const text=(pending.length?'NEXT: click_action for '+pending.map(x=>JSON.stringify(x)).join(', ')+' before buying. ':'')+'Variant state for this product (only actual valid option clicks count): '+JSON.stringify(selected)+'. Available variant groups: '+JSON.stringify(groups)+'. The title may describe a default variant, not your selection. Click each requested size/color/style/flavor using the exact option value before Buy Now. If a required option is absent, use < prev and inspect another product; do not substitute an unrelated color or size. Do not click group headings. Unrequested groups may remain unset.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text}]};
  });
 });
}
