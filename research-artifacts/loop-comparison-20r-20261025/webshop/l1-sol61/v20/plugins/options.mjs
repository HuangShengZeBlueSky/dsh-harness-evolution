export const name='options';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit}=p;let selected=[],latest='';
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept')return d;
   const raw=p.getRawBusinessResult(call.callId);latest=raw?.content||result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
   let args=call.arguments;if(typeof args==='string')try{args=JSON.parse(args)}catch{}
   if(call.name==='search_action'||(call.name==='click_action'&&(/^[a-z0-9]{10}$/i.test(args?.value||'')||args?.value==='back to search')))selected=[];
   if(call.name==='click_action'&&!['buy now','description','features','reviews','< prev','next >','back to search'].includes(args?.value)&&!/^b[a-z0-9]{9}$/i.test(args?.value||''))selected.push(args.value);
   return d;
  });
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();let text='Before buying, inspect ALL option groups on the product page, including style, scent, flavor, size, color, length and pack count. A matching title does not select a variant. Explicitly click each requested variant even if it looks like the default. Compare every available option with the instruction, then buy. Option labels can combine numbers and words (six lights = 6lights).';
   if(latest.includes('Buy Now'))text+='\nOptions already clicked on this product: '+JSON.stringify(selected)+'. Do not forget remaining requested options. Click each only once; unchanged page text after an option click is normal.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};
  });
 });
}
