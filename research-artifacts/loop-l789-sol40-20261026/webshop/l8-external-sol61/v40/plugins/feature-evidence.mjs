export const name='feature-evidence';
const norm=s=>' '+String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
const phrases=['paraben free','alcohol free','sulfate free','cruelty free','height adjustable','lumbar support','easy to install','long lasting','gluten free','nut free','sugar free','low carb','high protein','non gmo','machine washable','bpa free','eco friendly','arch support','synthetic sole','tempered glass','wireless charging','fast charging','motion detection'];
const stop=new Set('looking want need would like find some something please make sure with that also choose color colour ones lower than price dollars must should have will work kind purchase come comes preferably sized size free'.split(' '));
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit},next)=>{
  await next();
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||result.isError)return decision;
   const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');if(!raw.includes('Total results:'))return decision;
   const task=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';const required=phrases.filter(p=>norm(task).includes(norm(p)));if(required.length<2)return decision;
   const featureWords=new Set(required.join(' ').split(' '));const body=task.replace(/(?:and\s+)?price\s+(?:lower|less)\s+than[\s\S]*$/i,'');
   const anchors=[...new Set(norm(body).trim().split(' ').filter(w=>w.length>=4&&!stop.has(w)&&!featureWords.has(w)&&/[a-z]/.test(w)))];if(!anchors.length)return decision;
   const limit=task.match(/price\s+(?:lower|less)\s+than\s*\$?([\d.]+)/i);const cap=limit?Number(limit[1]):Infinity;
   const tokens=raw.split('[SEP]').map(x=>x.trim());const matches=[];
   for(let i=0;i<tokens.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(tokens[i])){
    const title=tokens[i+1],price=tokens[i+2],value=tokens[i].toLowerCase();const low=price.match(/\$([\d,.]+)/)?.[1];
    if(required.every(p=>norm(title).includes(norm(p)))&&anchors.some(w=>norm(title).includes(norm(w)))&&low&&Number(low.replaceAll(',',''))<cap)matches.push({value,title,price});
   }
   if(matches.length!==1)return decision;
   const text='Joint title evidence: the instruction explicitly requires '+JSON.stringify(required)+'. This visible title directly mentions every phrase: '+JSON.stringify(matches[0])+'. Inspect this candidate first, then verify the requested product type, exact variants and actual price before purchasing.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...decision,content:[...(decision.content||result.content),{type:'text',text}]};
  });
 });
}
