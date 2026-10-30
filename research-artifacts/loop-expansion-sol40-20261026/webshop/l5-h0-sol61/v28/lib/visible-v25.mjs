const states=new WeakMap();
export const norm=s=>String(s||'').toLowerCase().replace(/(\d+(?:\.\d+)?)[\s-]*(?:gig(?:abyte)?s?|gb)\b/g,'$1 gb').replace(/(\d+(?:\.\d+)?)[\s-]*(?:terabytes?|tb)\b/g,'$1 tb').replace(/(\d)(oz|ft|inch|gb|tb|watt|pack)\b/g,'$1 $2').replace(/\bgrey\b/g,'gray').replace(/\bfeet\b|\bfoot\b/g,'ft').replace(/\binches\b/g,'inch').replace(/\bounces?\b/g,'oz').replace(/\bxx[\s-]?large\b/g,'xxl').replace(/\b(?:x[\s-]?large|extra[\s-]large)\b/g,'xl').replace(/\bzero\b/g,'0').replace(/\bone\b/g,'1').replace(/\btwo\b/g,'2').replace(/\bthree\b/g,'3').replace(/\bfour\b/g,'4').replace(/\bfive\b/g,'5').replace(/\bsix\b/g,'6').replace(/\bseven\b/g,'7').replace(/\beight\b/g,'8').replace(/\bnine\b/g,'9').replace(/\bten\b/g,'10').replace(/\beleven\b/g,'11').replace(/\btwelve\b/g,'12').replace(/\bsixteen\b/g,'16').replace(/\btwenty\b/g,'20').replace(/\.(?!\d)/g,' ').replace(/[^a-z0-9.]+/g,' ').replace(/\s+/g,' ').trim();
const stop=new Set('i am looking searching for a an the to of and or with in on that has have it is are be my me some get want need would like find buy please should come make sure also choose pick one pair new hello can you from than lower price dollars color size there its this as at look get m d re ve ll sized all'.split(' '));
export const tokens=s=>[...new Set(norm(s).split(' ').map(w=>w.length>4&&!w.endsWith('ss')?w.replace(/s$/,''):w).filter(w=>w&&!stop.has(w)))];
const controls=new Set(['back to search','< prev','description','features','reviews','buy now','next >','prev <','search']);
export function memory(p){let s=states.get(p.agent);if(s)return s;s={task:'',tokens:[],limit:null,queries:[],products:{},resultIds:[],current:'',page:'',groups:{},selected:{},available:[],step:0,seen:new Set(),lastCalls:[],inspections:0,actionAttempts:0,modelCalls:0};states.set(p.agent,s);return s;}
export function sync(p){const s=memory(p);s.step=p.getVisibleInput().step||s.step;s.modelCalls=p.agent.session.snapshotEvents().filter(e=>e.type==='assistant/message').length;if(!s.task){const ms=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' '));ms.push(...(p.getVisibleInput().messages||[]).map(m=>typeof m.content==='string'?m.content:''));for(const t of ms){const m=t.match(/Instruction:\s*\[SEP\]\s*([\s\S]*?)\s*\[SEP\]/i);if(m){s.task=m[1];break;}}const m=s.task.match(/price lower than\s*([\d.]+)/i);s.limit=m?Number(m[1]):null;s.core=s.task.replace(/,?\s*and price lower than[\s\S]*/i,'');s.tokens=tokens(s.core);}return s;}
export function observe(p,call){const s=sync(p);if(s.seen.has(call.callId))return s;s.seen.add(call.callId);const raw=p.getRawBusinessResult(call.callId);if(!raw||raw.error)return s;const text=String(raw.content||'');const arg=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments||{};const v=String(arg.value||'').toLowerCase();s.lastCalls.push({name:call.name,value:v,keywords:arg.keywords||'',error:/invalid action|not available/i.test(text)});s.lastCalls=s.lastCalls.slice(-8);const line=text.split('Available Actions:')[1]||'';s.available=[...line.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map(m=>(m[1]??m[2]).replace(/\\'/g,"'").replace(/\\"/g,'"')).filter(x=>!['has_search_bar','clickables'].includes(x));const obs=(text.split('Observation:\n')[1]||text).split('\n\nAvailable Actions:')[0];const parts=obs.split('[SEP]').map(x=>x.trim());
 if(call.name==='search_action'){s.queries.push(arg.keywords||'');s.current='';s.groups={};s.selected={};}
 if(/^b[a-z0-9]{9}$/i.test(v)){s.current=v;s.groups={};s.selected={};if(s.products[v]){s.products[v].previousSelected={...s.products[v].selected};s.products[v].selected={};}}
 if(v==='back to search'){s.current='';s.groups={};s.selected={};}
 for(let i=0;i<parts.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(parts[i])&&parts[i+2].startsWith('$')){const id=parts[i].toLowerCase();s.products[id]??={id,title:parts[i+1],price:parts[i+2],docs:[],selected:{},inspected:[]};}
 s.page=parts.some(x=>/^Page \d/.test(x))?'results':s.available.includes('buy now')?'product':s.available.includes('search')?'search':'detail';
 if(s.page==='results')s.resultIds=s.available.filter(x=>/^b[a-z0-9]{9}$/i.test(x));
 const priceIndex=parts.findIndex(x=>x.startsWith('Price:'));const prev=parts.indexOf('< Prev');
 if(s.current&&priceIndex>=0){const q=s.products[s.current]??={id:s.current,docs:[],selected:{},inspected:[]};q.opened=true;q.title=parts[priceIndex-1];q.price=parts[priceIndex];if(prev>=0){let group=null;const groups={};for(const x of parts.slice(prev+1,priceIndex-1)){if(s.available.includes(x.toLowerCase())&&!controls.has(x.toLowerCase())){if(group)(groups[group]??=[]).push(x.toLowerCase());}else if(x.length<50)group=x.toLowerCase();}s.groups=groups;}
 for(const [g,vs]of Object.entries(s.groups))if(vs.includes(v))q.selected[g]=v;s.selected=q.selected;}
 if(s.current&&['features','description','reviews'].includes(v)){const q=s.products[s.current];if(q){q.docs.push(obs.replace(/Instruction:\s*\[SEP\][\s\S]*?\[SEP\]/,''));q.inspected.push(v);s.inspections++;}}
 return s;}
export function product(s){return s.products[s.current];}
export function evidence(q){return [q?.title||'',...(q?.docs||[]),...Object.values(q?.selected||{})].join(' ');}
export function missing(s,q=product(s)){const e=norm(evidence(q));return s.tokens.filter(w=>!e.includes(w));}
export function fit(s,q){const e=norm(evidence(q));let n=s.tokens.filter(w=>e.includes(w)).length;const price=Number(String(q.price||'').match(/\d+(?:\.\d+)?/)?.[0]);if(s.limit&&price>=s.limit)n-=s.tokens.length;return n;}
export function ranking(s){return Object.values(s.products).map(q=>({...q,fit:fit(s,q)})).sort((a,b)=>b.fit-a.fit);}
export function pending(s,config={}){
 const canonical=x=>norm(x).replace(/\bby\b/g,'x').replace(/\b(\d+)\s*pk\b/g,'$1 pack');
 const t=canonical(s.core),taskTokens=tokens(t),out=[];
 for(const [g,vs]of Object.entries(s.groups)){
  const prefix=vs[0]?.match(/^\d+\s*#\s*/)?.[0]||'';
  const sharedPrefix=prefix&&vs.every(v=>v.startsWith(prefix));
  const matched=vs.map(value=>{
   const n=canonical(sharedPrefix?value.slice(prefix.length):value),ws=tokens(n);
   let score=!ws.length?0:(' '+t+' ').includes(' '+n+' ')?10:ws.filter(w=>taskTokens.includes(w)).length/(ws.length||1);
   if(/^\d+(?:\.\d+)?$/.test(n)&&!(' '+t+' ').includes(' '+n+' '))score=0;
   if(config.compound&&ws.length>1&&ws.every(w=>taskTokens.includes(w)))score=12+ws.length;
   if(config.exact&&score<10)score=0;
   return {group:g,value,score};
  }).filter(x=>x.score>=(config.threshold??0.5)).sort((a,b)=>b.score-a.score);
  if(!matched.length)continue;
  const alternatives=matched.filter(x=>x.score===matched[0].score).map(x=>x.value);
  if(!alternatives.includes(s.selected[g]))out.push({...matched[0],alternatives});
 }
 return out;
}
export function section(r,name,text){return {...r,sections:[...r.sections,{name,order:40,text,interpolate:false}]};}
export function add(p,id,render,before){const {ac,audit}=p;const shared=memory(p);if(!shared.attemptCounterMounted){shared.attemptCounterMounted=true;ac.on('tools/pre-execute',async(call,next)=>{shared.actionAttempts++;return await next();});}ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();const text=render(sync(p));if(!text)return r;audit({method_id:id,hook:'system-prompt/assemble',text});return section(r,id,text);});ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const s=observe(p,call);const annotation=render(s);if(annotation)audit({method_id:id,hook:'tools/post-execute',annotation});return d;});if(before)ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;const reason=before(sync(p),call);if(!reason)return d;audit({method_id:id,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};});}


export function brandAnchor(s){
 if(s.page!=='results')return null;
 const generic=new Set('the a an new original women womens woman men mens kids baby organic natural white black blue red green purple pink gray gold silver ivory brown beige navy mint khaki modern small large mini high low easy long short heavy memory foam leather wooden wood metal steel plastic glass wireless bluetooth android usb hdmi displayport phone computer laptop speaker speakers cable adapter brush shampoo dress sandals sneakers bookcase bookshelf mattress clock alarm light lights chandelier chair table desk synthetic human hair extension extensions wig wigs fragrance paraben sulfate gluten protein foaming cream facial skin body lip gloss oral dental toothpaste toothbrush refillable non toxic pack set pieces piece made portable compatible soft premium simple adjustable'.split(' '));
 const visible=Object.values(s.products).filter(q=>s.available.includes(q.id));
 const prefix=q=>norm((q.title||'').split(/\s+/)[0]);
 const task=new Set(tokens(s.core));
 structuredLedger(s,null,{});for(const fact of s.requiredFacts||[])for(const word of tokens(fact.label))generic.add(word);
 const anchors=[...new Set(visible.map(prefix).filter(w=>/^[a-z][a-z0-9]{5,}$/.test(w)&&!generic.has(w)&&task.has(w)))];
 if(!anchors.length)return null;
 const goods=visible.filter(q=>anchors.includes(prefix(q))).filter(q=>{const price=Number(String(q.price).match(/\d+(?:\.\d+)?/)?.[0]);return !s.limit||!Number.isFinite(price)||price<s.limit;}).sort((a,b)=>fit(s,b)-fit(s,a));
 return goods.length?{anchors,goods}:null;
}


export function priceBounds(value){const xs=[...String(value||'').replace(/,/g,'').matchAll(/\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));return xs.length?{min:Math.min(...xs),max:Math.max(...xs)}:null;}
export function budgetCandidates(s,ids=s.resultIds||[]){
 const visible=ids.map(id=>s.products[id]).filter(Boolean),query=tokens(s.core);
 const names=brandAnchor({...s,page:'results',available:ids,limit:null});
 const goods=visible.filter(q=>q.id!==s.current&&(!names||names.goods.some(n=>n.id===q.id))).filter(q=>{const b=priceBounds(q.price);return b&&s.limit&&b.max<s.limit;});
 const sets=visible.map(q=>new Set(tokens(q.title)));
 const ranked=goods.map(q=>{const words=new Set(tokens(evidence(q)));const score=query.reduce((n,w)=>n+(words.has(w)?1+Math.log((visible.length+1)/(1+sets.filter(v=>v.has(w)).length)):0),0);return {...q,score};}).filter(q=>q.score>0).sort((a,b)=>b.score-a.score);
 return ranked;
}

export function structuredLedger(s,q,config={}){
 const canon=x=>norm(x).replace(/\b(\d+) pack\b/g,'pack of $1');
 if(!s.requiredFacts){
  const task=canon(s.core);const facts=[];
  const features=[
   ['gluten free',/gluten free|free of gluten/],['paraben free',/parabens? free|free of parabens?|no parabens?/],['sulfate free',/sulfates? free|free of sulfates?|no sulfates?/],['fragrance free',/fragrance free|unscented|no fragrance/],
   ['high protein',/high protein|protein rich/],['low carb',/low carb|low carbohydrate/],['long lasting',/long lasting|long wearing/],['easy installation',/easy to install|easy installation|easy install/],['easy assembly',/easy to assemble|easy assembly|easy to assamble/],['fully assembled',/fully assembled|comes assembled/],
   ['fast charging',/fast charging|quick charging|quick charge/],['arch support',/arch support/],['touchscreen',/touchscreen|touch screen/],['quad core',/quad core/],['ultra HD',/ultra hd|4k/],['synthetic hair',/synthetic hair/],['natural ingredients',/natural ingredients|all natural/],['organic',/\borganic\b/],['waterproof',/\bwaterproof\b/],['non toxic',/non toxic|nontoxic/],['refillable',/\brefillable\b/],['steel frame',/steel frame/],['heavy duty',/heavy duty/],['space saving',/space saving/]
  ];
  for(const [label,re]of features)if(re.test(task))facts.push({kind:'feature',label,re});
  for(const color of ['black','white','gray','blue','green','red','purple','pink','gold','silver','brown','beige','ivory','mint','navy']){const re=new RegExp('\\b'+color+'\\b');if(re.test(task))facts.push({kind:'color',label:color,re});}
  const size=task.match(/\bsize\s+(\d+(?:\.\d+)?|small|medium|large|xl|xxl|3xl)\b/);if(size)facts.push({kind:'size',label:size[1]});
  for(const m of task.matchAll(/\b\d+(?:\.\d+)?\s*(?:ft|inch|oz|gb|tb|watt|pack)\b|\bpack of \d+\b/g))facts.push({kind:'quantity',label:m[0]});
  s.requiredFacts=facts;
 }
 const selected=canon(Object.values(q?.selected||{}).join(' '));const title=canon(q?.title||'');const details=canon((q?.docs||[]).join(' '));
 const facts=s.requiredFacts.map(f=>{
  const seen=x=>f.re?f.re.test(x):(' '+x+' ').includes(' '+f.label+' ');
  const choice=['color','size','quantity'].includes(f.kind)&&Object.values(s.groups).flat().some(v=>seen(canon(v)));
  let status=seen(selected)?'SELECTED option':choice?'matching choice exists but NOT selected':seen(title)?'seen in TITLE':seen(details)?'seen in READ DETAILS':'UNVERIFIED';
  return {...f,status};
 });
 const functional=facts.filter(f=>f.kind==='feature'&&f.status==='UNVERIFIED');
 return `STRUCTURED REQUIREMENT LEDGER\nOriginal instruction: ${s.core}\n${facts.map(f=>f.kind+' '+f.label+': '+f.status).join('\n')||'No structured feature extracted; follow the original instruction.'}\nActual selected options: ${JSON.stringify(q?.selected||{})}; public price: ${q?.price||'unknown'}; limit: ${s.limit}\n${functional.length&&!q?.inspected.length?'Read Features once to check these functional requirements: '+functional.map(f=>f.label).join(', ')+'. Then return to this product with < prev.':'Use the evidence already read; do not reopen the same tab. Unverified does not mean absent. If the evidence contradicts a requirement, compare another matching product.'}\nThese extracted checks supplement the original instruction. Select all explicitly requested variants, then use the actual product-page buy now button when the product meets the request.`;
}

