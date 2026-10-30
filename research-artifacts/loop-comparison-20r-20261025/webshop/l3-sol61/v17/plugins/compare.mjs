export const name='compare';
const stop=new Set('i am looking want need would like buy find get some a an the and or of to for my in with that is it should be has have also please color size price lower than dollars high quality'.split(' '));
const terms=s=>s.toLowerCase().replace(/grey/g,'gray').replace(/sugarfree/g,'sugar free').replace(/[^a-z0-9.]+/g,' ').trim().split(/\s+/).filter(x=>x&&!stop.has(x)).map(x=>x.length>3&&!x.endsWith('ss')?x.replace(/s$/,''):x);
const txt=r=>(r.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit}=p;let note='';
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept')return d;
  const raw=txt(result);note='';if(!/Page \d+ \(Total results:/.test(raw))return d;
  const task=raw.split('Instruction: [SEP]')[1]?.split('[SEP]')[0]||'',goal=terms(task.split(/\bprice\b/i)[0]),limit=Number(task.match(/price (?:lower|less) than\s*([\d.]+)/i)?.[1]);
  const tokens=raw.split('\nAvailable Actions:')[0].split('[SEP]').map(x=>x.trim()),cards=[];
  for(let i=0;i<tokens.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(tokens[i]))cards.push({id:tokens[i].toLowerCase(),title:tokens[i+1],price:tokens[i+2],words:terms(tokens[i+1])});
  const targets=[...new Set(goal)];
  for(const card of cards){
   card.matched=targets.filter(t=>card.words.includes(t));card.missing=targets.filter(t=>!card.words.includes(t));
   card.score=card.matched.reduce((v,t)=>v+1+Math.log((cards.length+1)/(1+cards.filter(c=>c.words.includes(t)).length)),0);
   for(let i=0;i<goal.length-1;i++)if(card.words.join(' ').includes(goal[i]+' '+goal[i+1]))card.score+=2;
   const prices=[...card.price.matchAll(/\$([\d.]+)/g)].map(x=>Number(x[1]));card.over=limit&&prices.length&&Math.min(...prices)>limit;
   if(card.over)card.score-=8;
  }
  cards.sort((a,b)=>b.score-a.score);if(!cards.length)return d;
  note='Visible title comparison, ranked by requested words and compound phrases:\n'+cards.slice(0,3).map(c=>`${c.id}: matches ${c.matched.join(', ')}; absent from title ${c.missing.join(', ')}; ${c.price}${c.over?' ABOVE BUDGET':''}`).join('\n')+'\nStart by inspecting the strongest matching product. Keep the requested brand and product type; do not substitute a different type with a few shared words. Missing color/size may be selectable options. Title matching is evidence, not confirmation of unlisted features.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:note});return {...d,content:[...(d.content||result.content),{type:'text',text:note}]};
 });
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();const text=note||'Compare the requested brand, product type and compound feature phrases together before opening a product; select the requested variants on its page.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:35,text,interpolate:false}]};
 });
});}
