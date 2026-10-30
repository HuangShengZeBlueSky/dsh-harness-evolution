export const name='options';
const numbers={one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',sixteen:'16',twenty:'20'};
const norm=s=>s.toLowerCase().replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen|twenty)\b/g,x=>numbers[x]).replace(/grey/g,'gray').replace(/([a-z])(\d)|(\d)([a-z])/g,'$1$3 $2$4').replace(/[^a-z0-9.]+/g,' ').trim();
const words=s=>norm(s).split(/\s+/).filter(x=>x&&!['a','the','of','pack','count','very','name','color','size'].includes(x));
const colors=new Set('black white red blue green yellow pink purple orange gray brown beige ivory gold silver navy teal mint rainbow fuchsia burgundy tan coral khaki cream turquoise lavender mauve maroon peach olive aqua champagne taupe'.split(' '));
const tones=new Set('light dark deep pale bright hot dusty royal sky baby natural ash warm cool off'.split(' '));
const txt=m=>typeof m?.content==='string'?m.content:(m?.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,agent,audit,getVisibleInput}=p;let task='',page='',chosen=new Set();
 const available=()=>{const s=page.split("'clickables': [")[1]?.split(/\]\s*\}/)[0]||'';return [...s.matchAll(/(['"])((?:\\.|(?!\1)[\s\S])*)\1/g)].map(m=>m[2].replace(/\\(['"\\])/g,'$1'));};
 function groups(){
  const tokens=page.split('\nAvailable Actions:')[0].split('[SEP]').map(x=>x.trim());
  const price=tokens.findIndex(x=>/^Price:/i.test(x)),start=tokens.findIndex(x=>x.toLowerCase()==='< prev');
  if(price<0||start<0)return [];
  const groups=[];let group;
  for(const value of tokens.slice(start+1,price-1)){
   if(/^(color|size|style|flavor|flavour|scent|pattern|material|length|configuration|item package quantity|number of items)( name)?$/i.test(value)){group={name:value,values:[]};groups.push(group);}else if(group)group.values.push(value);
  }
  return groups;
 }
 const requestedColors=()=>{const t=words(task),want=[];for(let i=0;i<t.length;i++)if(colors.has(t[i])){want.push(t[i]);if(i&&tones.has(t[i-1]))want.push(t[i-1]);}return [...new Set(want)];};
 function missingColor(){const wanted=requestedColors(),g=groups().find(g=>/^color/i.test(g.name));return wanted.length&&g&&g.values.some(v=>words(v).some(w=>colors.has(w)))&&!g.values.some(v=>wanted.every(w=>words(v).includes(w)))?wanted:[];}
 function pending(){
  const target=new Set(words(task.split(/,?\s*(?:and )?price (?:lower|less)/i)[0])),size=norm(task).match(/\bsize (?:is )?(\d+(?:\.\d+)?)/)?.[1];
  return groups().map(g=>{
   const wanted=requestedColors(),isColor=/^color/i.test(g.name)&&wanted.length&&g.values.some(v=>words(v).some(w=>colors.has(w)));
   let matches=g.values.map(value=>{const w=words(value.replace(/^\d+\s*#/,'')).map(x=>x.replace(/s$/,''));const hits=w.filter(x=>[...target].some(t=>t.replace(/s$/,'')===x)).length;const colorHit=isColor&&wanted.every(c=>words(value).includes(c));return {value,score:isColor?(colorHit?10+wanted.length-words(value).filter(x=>colors.has(x)).length:0):(w.length&&hits===w.length?hits:0)};}).filter(x=>x.score>0);
   matches.sort((a,b)=>b.score-a.score||a.value.length-b.value.length);
   return matches.length&&!g.values.some(v=>chosen.has(v))?{group:g.name,value:matches[0].value}:null;
  }).filter(Boolean);
 }
 function guidance(){
  if(!page||page.includes("'has_search_bar': True"))return 'Search page: call search_action to find the requested product. A product must be opened before options or buy now are available.';
  if(/Page \d+ \(Total results:/.test(page))return 'Search results page: compare product titles and prices, then click an available product identifier copied exactly. buy now is not available here. If a click failed, copy a valid identifier from this page instead of trying to buy.';
  const ceiling=Number(task.match(/price (?:lower|less) than\s*([\d.]+)/i)?.[1]),price=Number(page.match(/Price:\s*\$([\d.]+)/i)?.[1]);
  if(ceiling&&price>ceiling)return `This product costs at least $${price}, above the requested $${ceiling} limit. Click '< prev' and choose a matching product below the limit; do not buy this one.`;
  const need=pending();
  const absent=missingColor(),colorNote=absent.length?` Exact requested color words ${JSON.stringify(absent)} are not all present in the selectable colors. Do not label a partial color-word match as exact. ${getVisibleInput().step<15?'Compare one promising alternative if it may supply the full color; avoid repeated browsing just to match color wording.':'Complete the best supported purchase using the remaining calls rather than restarting a color search.'}`:'';
  if(page.includes("'clickables': ['back to search', '< prev']")&&!page.includes('Price:'))return "This is a detail subpage. Click '< prev' to return to the product page before selecting options or buying. Do not search again solely to exit this subpage.";
  return `Requested product: ${task}\nAlready clicked options on this product: ${JSON.stringify([...chosen])}. Matching requested options still to click: ${JSON.stringify(need)}. ${need.length?'Next click_action value: '+JSON.stringify(need[0].value)+'. Select each pending option before buy now.':'Select all other explicitly requested options, then buy now if the product fits.'} A product title does not select any option. Do not repeat options already clicked.${colorNote}`;
 }
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='click_action')return d;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,list=available();
  if(!list.length||list.includes(args.value))return d;
  const key=s=>s.toLowerCase().replace(/\s+/g,'');const matches=list.filter(x=>key(x)===key(args.value));
  if(matches.length===1){call.arguments={...args,value:matches[0]};audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'rewrite',from:args.value,to:matches[0]});return d;}
  const reason=`That click is not available on this page. ${guidance()} Available values: ${JSON.stringify(list)}.`;
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept')return d;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const raw=txt(result);if(result.isError)return d;
  if(call.name==='search_action'||/^b[a-z0-9]{9}$/i.test(args.value||'')||args.value==='back to search')chosen.clear();
  else if(call.name==='click_action'&&!['buy now','description','features','reviews','< prev','next >'].includes(args.value))chosen.add(args.value);
  page=raw;task=raw.split('Instruction: [SEP]')[1]?.split('[SEP]')[0]?.trim()||task;
  const annotation=guidance();audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
  return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();if(!task){const initial=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>txt(e.data)).join('\n');task=initial.split('Instruction: [SEP]')[1]?.split('[SEP]')[0]?.trim()||'';if(!page)page=initial;}
  const text=guidance();audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};
 });
});}
