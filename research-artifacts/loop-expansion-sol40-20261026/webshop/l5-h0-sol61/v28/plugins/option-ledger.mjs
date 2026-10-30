export const name='option-ledger';
export function apply(ctx,config={}){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getRawBusinessResult}=p;
  let groups={},selected={},product='';
  const controls=new Set(['back to search','< prev','description','features','reviews','buy now','next >','search']);
  const view=()=>Object.entries(groups).map(([g,vs])=>`${g}: ${selected[g]?'selected '+selected[g]:'NOT selected; choices '+vs.join(' | ')}`).join('\n');
  const guidance=()=>`SPECIFICATION LEDGER\n${view()}\nFor every explicit requirement, click its matching available option even when the title already mentions it. Option group labels can be misleading: color may contain light counts, styles or lengths. Choose the matching value by its meaning. Do not invent requirements for unspecified groups. A click leaves the page looking unchanged; the ledger remembers it. After all requested choices are selected, click buy now.`;
  ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();const text=guidance();audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};});
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
   const text=raw.content;const value=call.arguments?.value;
   if(call.name==='search_action'||(call.name==='click_action'&&/^b[a-z0-9]{9}$/i.test(value||''))||value==='back to search') {groups={};selected={};product=value||'';}
   for(const [g,vs]of Object.entries(groups))if(vs.includes(value))selected[g]=value;
   const obs=text.split('Observation:\n')[1]?.split('\n\nAvailable Actions:')[0]||text;
   const parts=obs.split('[SEP]').map(s=>s.trim());const start=parts.indexOf('< Prev'),end=parts.findIndex(s=>s.startsWith('Price:'));
   if(start>=0&&end>start){
    const actions=text.split("'clickables': [")[1]?.split(']}')[0]||'';
    const available=[...actions.matchAll(/'([^']*)'/g)].map(m=>m[1]);let group=null;const found={};
    for(const part of parts.slice(start+1,end-1)){
     if(available.includes(part.toLowerCase())&&!controls.has(part.toLowerCase())){if(group)(found[group]??=[]).push(part.toLowerCase());}
     else if(part.length<40){group=part.toLowerCase();}
    }
    if(Object.keys(found).length)groups=found;
   }
   if(!Object.keys(groups).length)return d;
   const annotation=guidance();audit({method_id:name,hook:'tools/post-execute',annotation,product,selected,groups});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
