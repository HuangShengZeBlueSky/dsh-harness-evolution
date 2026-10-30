export const name='result-compare';
const stop=new Set('i am looking for need want would like some a an the to of in on that is are it and with my me get buy choose pick should be have has also one ones please price lower than dollars'.split(' '));
const words=s=>s.toLowerCase().replace(/[^a-z0-9.]+/g,' ').trim().split(/\s+/);
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=p;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept')return d;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error||!raw.content.includes('Page '))return d;
  const parts=raw.content.split('[SEP]').map(s=>s.trim());const task=parts[1]||'';
  const limit=Number(task.match(/price\s+(?:lower|less)\s+than\s+([\d.]+)/i)?.[1]||Infinity);
  const query=[...new Set(words(task.replace(/,?\s*(?:and\s+)?price\s+(?:lower|less).*$/i,'')))].filter(w=>w&&!stop.has(w));
  const rows=[];for(let i=2;i<parts.length-2;i++)if(/^[A-Z0-9]{10}$/.test(parts[i])&&/^\$/.test(parts[i+2]))rows.push({id:parts[i].toLowerCase(),title:parts[i+1],price:Number(parts[i+2].match(/[\d.]+/)?.[0]),tokens:new Set(words(parts[i+1]))});
  if(!rows.length)return d;
  for(const r of rows){r.matched=query.filter(w=>r.tokens.has(w));r.score=r.matched.reduce((n,w)=>n+1+Math.log((rows.length+1)/(1+rows.filter(x=>x.tokens.has(w)).length)),0);}
  for(const r of rows)r.score+=12*query.filter(w=>/^[a-z]+\d[a-z0-9]*$/.test(w)&&r.tokens.has(w)).length;
  const ranked=rows.filter(r=>r.price<limit).sort((a,b)=>b.score-a.score).slice(0,3);
  const annotation='Visible title comparison (word overlap is a clue, verify product type and options):\n'+ranked.map(r=>r.id+' | '+r.title+' | matched request words: '+r.matched.join(', ')).join('\n');
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
