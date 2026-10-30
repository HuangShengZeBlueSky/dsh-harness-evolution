export const name='option-state';
const groups=new Set(['size','color','style','flavor','scent','pattern','configuration','item package quantity','number of items','length','material','capacity','model','fit type','size name','color name','flavor name','pack size']);
const norm=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/(\d)\s*(?:x|by)\s*(\d)/g,'$1 x $2').trim();
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,agent,audit,getRawBusinessResult}=p;
  let request='',wantedSize='',wantedColor='',wantedFlavor='',selected={},lastTitle='';
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept')return d;
   if(!request){const initial=agent.session.snapshotEvents().find(e=>e.type==='user/message');const task=(initial?.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');const instruction=task.split('[SEP]')[2]||task;request=norm(instruction);wantedFlavor=instruction.match(/\b(?:want|choose|pick|in)\s+((?:[a-z]+[\s&-]+){0,3}[a-z]+)\s+flavou?r\b/i)?.[1]||'';wantedColor=instruction.match(/\b([a-z0-9-]+)\s+colou?red\b/i)?.[1]||instruction.match(/\b([a-z0-9-]{4,})\s+([a-z0-9-]+)\s+colou?r\b/i)?.[2]||'';wantedSize=instruction.match(/\bsize\s+(\d+(?:\.\d+)?)/i)?.[1]||'';}
   const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
   const text=raw.content;const parts=text.split('[SEP]').map(s=>s.trim());
   const pi=parts.findIndex(s=>/^Price:/.test(s));
   if(pi<0){if(call.name==='search_action'||/click\[back to search\]/i.test(text)){selected={};lastTitle='';}return d;}
   const title=parts[pi-1];if(title!==lastTitle){selected={};lastTitle=title;}
   const options={};let group;
   for(const part of parts.slice(0,pi-1)){if(groups.has(part.toLowerCase())){group=part.toLowerCase();options[group]=[];}else if(group)options[group].push(part);}
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(call.name==='click_action')for(const [g,vs] of Object.entries(options))if(vs.includes(args.value))selected[g]=args.value;
   const pending=[];
   for(const [g,vs] of Object.entries(options)){
    if(selected[g])continue;
    const matches=vs.filter(v=>{const n=norm(v);return (n.length>1||(g==='size'&&v===wantedSize))&&(' '+request+' ').includes(' '+n+' ');});
    if(matches.length)pending.push(g+': '+matches.join(' OR '));
   }
   if(wantedSize&&options.size?.every(v=>/^\d+(?:\.\d+)?$/.test(v))&&!options.size.includes(wantedSize))pending.push('Required size '+wantedSize+' is NOT available on this product. Return to search; do not substitute another numeric size');
   const missingColor=wantedColor&&options.color&&!options.color.some(v=>(' '+norm(v)+' ').includes(' '+norm(wantedColor)+' '));
   const annotation='Selection state for this product: '+JSON.stringify(selected)+'. '+(pending.length?'Requested options still unselected: '+pending.join('; ')+'. Click matching values before buy now.':'Check the instruction against the available option groups before buy now; a value in the title is not a selected option.');
   const flavorValues=options.flavor||options['flavor name'];const flavorWords=norm(wantedFlavor).split(' ').filter(w=>w&&w!=='and');const missingFlavor=flavorWords.length&&flavorValues&&!flavorValues.some(v=>flavorWords.every(w=>(' '+norm(v)+' ').includes(' '+w+' ')));
   const warning=missingColor?' Required named color '+wantedColor+' is unavailable in this product color group. Do not substitute another color; click < prev to compare other products.':'';
   const flavorWarning=missingFlavor?' Required flavor '+wantedFlavor+' is unavailable on this product. Click < prev or search for another product with the requested flavor; do not substitute the available flavors.':'';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:annotation+warning+flavorWarning});
   return {...d,content:[...(d.content||result.content),{type:'text',text:annotation+warning+flavorWarning}]};
  });
 });
}
