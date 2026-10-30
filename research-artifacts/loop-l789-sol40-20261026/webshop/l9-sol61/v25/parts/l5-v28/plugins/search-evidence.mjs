export const name='search-evidence';
const stops=new Set('i am looking for a an the to of and or with in on that has have it is are be my me some get want need would like find buy please should come make sure also choose pick one pair new hello can you from than lower price dollars color size'.split(' '));
const norm=s=>s.toLowerCase().replace(/\bgrey\b/g,'gray').replace(/[^a-z0-9.]+/g,' ').trim();
const words=s=>norm(s).split(/\s+/).filter(w=>w&&!stops.has(w));
export function apply(ctx,config={}){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,getVisibleInput,getRawBusinessResult,agent}=p;let task='',query='',ranked=[],latest='',searched=[],phase='search';const seen=new Map(),opened=new Set();let probed=false,busy=false,attempts=0;
 function init(){if(task)return;const v=getVisibleInput();const texts=(v.messages||[]).map(m=>typeof m.content==='string'?m.content:'').concat(agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ')));
 for(const t of texts){const m=t.match(/Instruction:\s*\[SEP\]\s*([\s\S]*?)\s*\[SEP\]/i);if(m){task=m[1];break;}}query=task.replace(/,?\s*and price lower than[\s\S]*/i,'').replace(/\b(?:i am looking for|i'm looking for|i would like|i want to find|i want to buy|i need to buy|i need|i want|look for|find me|can i get)\b/gi,'').trim();}
 function note(){init();return `SEARCH EVIDENCE\nRequest: ${task}\nSearch with product identity and distinctive requirements, without price/dollar words. Suggested query: ${query}\n${ranked.length?'Visible title matches (lexical clues, not proof):\n'+ranked.slice(0,config.top||3).map(x=>`${x.id}: ${x.title}; absent title words: ${x.missing.join(', ')}`).join('\n'):''}\nRespect the requested brand/model and product type. If results are accessories for the requested product rather than the product itself, click back to search and search only the brand plus core product type, removing incidental features. A title may omit a requirement; inspect Features or Description if necessary. Do not replace an explicit brand or material with a superficially similar item.`;}
 ac.on('tools/pre-execute',async(call,next)=>{
  attempts++;const d=await next();if(d.kind!=='allow')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const best=ranked[0];const quantity=w=>/^(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|pack|packs|piece|pieces)$/.test(w);
  if(busy||probed||attempts>14||phase!=='results'||call.name!=='click_action'||a?.value!=='back to search'||!best||opened.has(best.id)||(seen.get(best.id)||0)<2||!best.missing.length||!best.missing.every(quantity)||words(query).filter(w=>!best.missing.includes(w)).length<3)return d;
  probed=true;busy=true;let raw=null;const childId=call.callId+':inspect';
  try{
   const out=await ac.tools.execute({callId:childId,rootCallId:call.rootCallId||call.callId,parent:call.token,name:'click_action',arguments:{value:best.id},agent:call.agent||p.agent,signal:call.signal});
   raw=getRawBusinessResult(childId);
   if(raw&&!raw.error&&!out.isError)audit({method_id:name,hook:'tools/native-inspect',decision:'executed',call_id:childId,parent_call_id:call.callId,value:best.id});
  }finally{busy=false;}
  const reason='Repeated search showed the same identity-matching product; its default title is not the full list of pack sizes. Executed a real product-page inspection instead of leaving results again. This is NOT a purchase. CURRENT ACTUAL OBSERVATION:\n'+String(raw?.content||'No successful observation; use actual legal actions.')+'\nRead these actual options and select the requested quantity if present, then verify all requirements and buy. If absent, continue searching.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
 ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();if(config.phaseOnly&&!['search','results'].includes(phase))return r;const text=note();audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}],tools:r.tools.map(t=>t.name==='search_action'?{...t,description:t.description+' Use only product type, brand, model, and distinctive features. Exclude price constraints and dollar amounts.'}:t)};});
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;init();latest=raw.content;const parts=latest.split('[SEP]').map(s=>s.trim());const titles=[];for(let i=0;i<parts.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(parts[i])&&parts[i+2].startsWith('$'))titles.push({id:parts[i].toLowerCase(),title:parts[i+1],price:parts[i+2]});
 phase=titles.length?'results':latest.includes('Price:')?'product':latest.includes("'has_search_bar': True")?'search':'other';
 if(titles.length){const tokens=[...new Set(words(query))];const freq=Object.fromEntries(tokens.map(w=>[w,titles.filter(x=>norm(x.title).includes(w)).length]));ranked=titles.map(x=>{const title=norm(x.title);const missing=tokens.filter(w=>!title.includes(w));const score=tokens.reduce((s,w)=>s+(title.includes(w)?1+Math.log((titles.length+1)/(freq[w]+1)):0),0);return {...x,score,missing};}).sort((a,b)=>b.score-a.score);}
 if(call.name==='click_action'&&/^b[a-z0-9]{9}$/i.test(call.arguments?.value||''))opened.add(call.arguments.value.toLowerCase());
 if(titles.length)for(const x of titles)seen.set(x.id,(seen.get(x.id)||0)+1);
 if(!titles.length)return d;const annotation=note();audit({method_id:name,hook:'tools/post-execute',annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
