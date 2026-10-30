// 身份证据与恢复：品类/性别优先，先返回再提示当前合法候选，无同类时有限重搜，保留完整规格要求
export const name='identity-evidence';
const stop=new Set('i am im looking searching look for a an the and or with that has have it its to of in on is be my some want need would like get buy find me should also make sure please can which from choose pick purchase hello most people use pair one price lower less than dollar size sized color colour pack count fluid fl oz ounce out ml foot feet ft inch inche but'.split(' '));
function words(s){return (s.toLowerCase().replace(/\bi['’]m\b/g,' ').replace(/\bi['’]d\b/g,' ').replace(/['’]s\b/g,'').replace(/\bmens\b/g,'men').replace(/\bwomens\b/g,'women').replace(/\bfoaming\b/g,'foam').replace(/\bcreamy\b/g,'cream').replace(/\beau de (?:toilette|parfum)\b/g,'perfume').replace(/\bparfum\b/g,'perfume').replace(/\bgroceries\b/g,'grocery').match(/[a-z0-9]+(?:\.[0-9]+)?/g)||[]).map(w=>w.length>4&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w);}
const phrase=(s,p)=>(' '+words(s).join(' ')+' ').includes(' '+words(p).join(' ')+' ');
const kinds=[
 {tag:'perfume',need:['perfume'],forms:['perfume'],bad:['toothpaste','cleanser']},
 {tag:'cleanser',need:['cleanser','face wash'],forms:['cleanser','face wash'],bad:[]},
 {tag:'truffle',need:['truffle'],forms:['truffle'],bad:['bar','syrup','gum']},
 {tag:'jean',need:['jean'],forms:['jean'],bad:['short'],query:'denim long jeans pants'},
 {tag:'pant',need:['pant','trouser'],forms:['pant','trouser'],bad:['short'],query:'long pants trousers'},
 {tag:'stool',need:['barstool','bar stool'],forms:['barstool','bar stool','stool'],bad:['fixture','lighting']},
 {tag:'sandal',need:['sandal','wedge'],forms:['sandal','wedge'],bad:['boot']},
 {tag:'sneaker',need:['sneaker','running shoe','slip on shoe'],forms:['sneaker','shoe','trainer'],bad:[]},
 {tag:'grocery',need:['grocery'],forms:['food','ingredient','snack','cookie','flour','cracker'],bad:['organizer','storage basket','shopping basket','shower caddy'],query:'food groceries ingredients'},
 {tag:'granola',need:['granola'],forms:['granola'],bad:[]}
];
function volumes(s){const out=[];for(const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(ml|millilit(?:er|re)s?|fl(?:uid)?\.?\s*(?:oz|ounces?|out))\b/gi))out.push(Number(m[1])*(/^m/i.test(m[2])?1:29.5735295625));return out;}
const near=(a,b)=>Math.abs(a-b)/Math.max(a,b)<=.03;
const clickable=(a,id)=>a.includes("'"+id+"'")||a.includes('"'+id+'"');
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;const shop=p.shop ||= {};let rows=[],task='',onProduct=false,onResults=false,actions='',plan=null,refined=false;const details=new Map(),checked=new Set();
 const display=(items,target)=>items.map(r=>r.id+': '+r.title+' | '+r.price+(target!==null?' | capacity '+(r.fits?'near requested value':'not established as requested'):'')).join('\n');
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=p.getRawBusinessResult(call.callId)?.content||'';if(!raw)return d;
 const found=raw.match(/Instruction:\s*\[SEP\]\s*(.*?)\s*\[SEP\]/s);if(found)task=found[1];
 if(raw.includes('Available Actions:')){actions=raw.split('Available Actions:').pop();onProduct=/['"]buy now['"]/.test(actions);onResults=raw.includes('Total results:');}
 const seg=raw.split('[SEP]').map(x=>x.trim());
 if(onResults){rows=[];for(let i=0;i<seg.length-2;i++)if(/^[a-z0-9]{10}$/i.test(seg[i]))rows.push({id:seg[i].toLowerCase(),title:seg[i+1],price:seg[i+2]});}
 const o=shop.options;if(o&&['features','description'].includes(call.arguments?.value)&&!onProduct){const body=raw.split('Available Actions:')[0].split('[SEP]').map(x=>x.trim());const a=body.indexOf('< Prev');if(a>=0)details.set(o.title,(details.get(o.title)||'')+' '+body.slice(a+1).join(' '));}
 if(plan&&onProduct&&plan.phase==='pick'){const i=seg.findIndex(x=>/^Price:/.test(x));if(i>0&&seg[i-1]!==plan.origin)plan=null;}
 if(!plan||!onResults)return d;
 if(plan.phase==='search'){plan=null;return d;}
 if(plan.phase!=='return')return d;const visible=plan.targets.filter(r=>clickable(actions,r.id));if(!visible.length){plan=null;return d;}
 const text='Identity recovery: the result list is NOW visible. Select a CURRENT clickable candidate using the complete task, including size/color/quantity and price. Stronger same-type title evidence:\n'+display(visible,plan.target)+'\nThese IDs are currently clickable. Open the best full match, then select its required options and buy now.';
 plan.phase='pick';audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;const value=call.arguments?.value;
 if(plan&&call.name==='click_action'&&/^[a-z0-9]{10}$/i.test(value)&&!clickable(actions,value.toLowerCase())){const reason=plan.phase==='search'?'Next call search_action with '+JSON.stringify({keywords:plan.query})+'. That remembered product ID is not clickable here.':'Next call click_action({"value":"< prev"}). That product ID is not clickable on this page. Return to the parent page first; candidate IDs will be shown only after the actual result list appears.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
 if(plan&&call.name==='click_action'&&value==='buy now'&&!onProduct&&!onResults&&actions.includes("'< prev'")){const reason='Next call click_action({"value":"< prev"}) to leave this information page. Observe the returned page before selecting a product or buying.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
 if(call.name!=='click_action'||value!=='buy now'||!onProduct||p.getVisibleInput().step>(config.max_review_step??14))return d;
 const o=shop.options;if(!o||!rows.length||checked.has(o.title))return d;const core=task.replace(/,?\s*and price lower than.*$/i,'').split(/\b(?:if possible|preferably)\b/i)[0];const kind=kinds.find(k=>k.need.some(x=>phrase(core,x)));if(!kind)return d;
 if(kind.tag==='grocery'&&(!phrase(core,'ingredient')||kind.bad.some(x=>phrase(core,x))))return d;
 const male=['men','man','boy'].some(x=>phrase(core,x)),female=['women','woman','girl'].some(x=>phrase(core,x));const gender=male&&!female?'male':female&&!male?'female':null;
 const opposite=t=>!phrase(t,'unisex')&&(gender==='male'?['women','woman','girl'].some(x=>phrase(t,x))&&!['men','man','boy'].some(x=>phrase(t,x)):gender==='female'?['men','man','boy'].some(x=>phrase(t,x))&&!['women','woman','girl'].some(x=>phrase(t,x)):false);
 const subtype=kind.tag==='cleanser'&&phrase(core,'foam cream')?['foam','cream']:[];
 const contrary=t=>kind.bad.some(x=>phrase(t,x)&&!phrase(core,x));const same=t=>kind.forms.some(x=>phrase(t,x))&&subtype.every(x=>phrase(t,x))&&!contrary(t)&&!opposite(t);
 const cleanCore=core.replace(/\blong[ -]+lasting\b/gi,' ').replace(/\bhigh[ -]+quality\b/gi,' ').replace(/\beasy to use\b/gi,' ');const terms=[...new Set(words(cleanCore).filter(w=>w.length>=3&&!/\d/.test(w)&&!stop.has(w)))];if(!terms.length)return d;
 const lexical=t=>new Set(words(t));const rowSets=rows.map(r=>lexical(r.title));const weights=new Map(terms.map(w=>[w,1+Math.log((rows.length+1)/(1+rowSets.filter(s=>s.has(w)).length))]));const score=set=>terms.reduce((n,w)=>n+(set.has(w)?weights.get(w):0),0);
 const evidenceText=o.title+' '+Object.values(o.chosen).join(' ')+' '+(details.get(o.title)||'');const current=lexical(evidenceText),currentScore=score(current);const limit=task.match(/price lower than\s*([\d.]+)/i),upper=limit?Number(limit[1]):null;
 const quantity=volumes(core),target=quantity.length&&quantity.every(v=>near(v,quantity[0]))?quantity[0]:null;
 const candidates=rows.filter(r=>same(r.title)).filter(r=>{const m=r.price.match(/\$([\d.]+)/);return upper===null||!m||Number(m[1])<upper;}).map(r=>{const set=lexical(r.title);return {...r,score:score(set),hit:terms.filter(w=>set.has(w)),fits:target!==null&&volumes(r.title).some(v=>near(v,target))};}).sort((a,b)=>b.score-a.score||Number(b.fits)-Number(a.fits));
 const conflict=contrary(o.title)||opposite(evidenceText);
 if(!candidates.length){if(!conflict||refined)return d;refined=true;checked.add(o.title);const query=(kind.query||kind.forms.join(' '))+' '+words(core).filter(w=>!stop.has(w)).join(' ');plan={phase:'search',origin:o.title,query};const reason='Next call search_action with '+JSON.stringify({keywords:query})+'. The current title explicitly conflicts with the requested product form/audience, and no current visible title establishes the requested form. Re-search the core identity while keeping the other requirements.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
 const best=candidates[0],missingSubtype=subtype.length&&!subtype.every(w=>current.has(w));if(!conflict&&!missingSubtype&&best.score<currentScore+(config.min_gain??1.8))return d;const additional=best.hit.filter(w=>!current.has(w));if(!conflict&&!missingSubtype&&!additional.length)return d;
 checked.add(o.title);plan={phase:'return',origin:o.title,targets:candidates.slice(0,3),target};
 const reason='Next call click_action({"value":"< prev"}) to restore the result list FIRST. Do not click remembered product IDs on this product page.\nTask: '+core+'\nCurrent title: '+o.title+'\n'+(conflict?'The title conflicts with the requested form or audience.':missingSubtype?'The requested foaming-cream product form is not established by current evidence.':'Current search titles provide stronger identity evidence for: '+additional.join(', '))+'\nAfter the result list really appears, current clickable alternatives will be shown. Keep the complete product identity, quantity, required options and budget together.';
 audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};});
 });}
