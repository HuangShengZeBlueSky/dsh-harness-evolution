export const name='options';
const norm=s=>s.toLowerCase().replace(/\band\b/g,' ').replace(/[″”"]/g,' inch ').replace(/[×]/g,'x').replace(/ounces?/g,'oz').replace(/inches/g,'inch').replace(/[^a-z0-9.]+/g,' ').trim().replace(/\s+/g,' ');
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;let title='',selected=new Set(),options=[],pending=[],denials=0;
  ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||p.getVisibleInput().step>=18)return d;let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{a={};}}
   if(call.name==='click_action'&&a?.value?.toLowerCase()==='buy now'&&pending.length&&denials<2){denials++;const reason='Before purchasing, select these explicitly requested visible options: '+pending.map(v=>JSON.stringify(v)).join(', ')+'. Click each option, then buy now.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return d;});
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept')return d;
   const raw=result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');
   if(!raw.includes('Price:')||!raw.includes('Buy Now'))return d;
   const parts=raw.split('[SEP]').map(x=>x.trim());const price=parts.findIndex(x=>x.startsWith('Price:'));const current=parts[price-1];
   if(current!==title){title=current;selected.clear();}
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{a={};}}
   if(options.includes(a?.value))selected.add(a.value);
   const task=norm(((raw.match(/Instruction:\s*\[SEP\]\s*(.*?)\s*\[SEP\]/s)||[])[1]||'').replace(/,?\s*and price lower than.*/i,''));
   const groups=[];let group=null;
   for(const v of parts.slice(parts.indexOf('< Prev')+1,price-1)){
    if(/^(color|size|style|flavor name|scent|scent name|item package quantity|pattern name|configuration|length|number of items|material type|model name)$/i.test(v)){group=[];groups.push(group);}else if(group)group.push(v.toLowerCase());
   }
   options=groups.flat();const targets=groups.map(g=>g.map(v=>({v,n:norm(v.replace(/^\d+\s*#\s*/,''))})).filter(o=>o.n&&(' '+task+' ').includes(' '+o.n+' ')).sort((a,b)=>b.n.length-a.n.length)[0]?.v).filter(Boolean);
   pending=targets.filter(v=>!selected.has(v));return d;
  });
 });
}
