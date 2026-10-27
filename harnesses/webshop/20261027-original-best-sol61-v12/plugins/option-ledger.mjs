import {installResumeRole} from '../lib/resume-policy.mjs';
const resumeFeatures = ["full-flavor", "named-shade", "two-dimensions", "purchase-reserve", "color-code", "combined-formula"];
import {flavorKey,explicitFlavor,norm,actions,rawText,initialObservation,productGroups,requestedDevice,accessoryEvidence,wantsHotCocoa,cocoaTitleRole,dimensions3,readyIngredientPair,ingredientTokens,eyelashSpecGoal,eyelashVariant,matchesEyelashSpec,fortuneCookieGoal,fortuneCookieRole,flashDriveGoal,flashDriveTitleRole,gbCapacities,matchesFlashCapacity,truffleGoal,truffleTitleRole,truffleFlavorMatches,foodPhrase,namedPerfumeGoal,perfumeTitleRole,containsPerfumeName,visiblePerfumeVolumes} from '../lib/visible-state.mjs';
export const name = 'option-ledger';
const colors=['rose gold','light blue','dark blue','dark brown','light brown','dark blonde','light blonde','medium blonde','medium brown','navy blue','black','white','red','green','blue','grey','gray','pink','purple','gold','silver','beige','ivory','brown','navy','orange','yellow','blonde','auburn','tan','mauve','teal','burgundy'];
const colorWords=s=>colors.filter(c=>new RegExp('(^|[^a-z])'+c+'([^a-z]|$)').test(s)).filter(c=>!colors.some(d=>d!==c&&d.includes(c)&&new RegExp('(^|[^a-z])'+d+'([^a-z]|$)').test(s)));
const canonical=s=>s.replace(/gray/g,'grey');
const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
const quantitative=s=>norm(s).replace(/\b(\d+)\s+1\/2\b/g,(_,n)=>String(Number(n)+0.5)).replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g,w=>numbers[w]).replace(/\b(?:feet|foot)\b/g,'ft').replace(/\bounces?\b/g,'oz').replace(/(\d)\s*pk\b/g,'$1 pack').replace(/(\d)\s*(ft|fl\s*oz|oz)\b/g,(_,n,u)=>n+u.replace(/\s/g,''));
function dimensions(value){
 const triple=dimensions3(value);if(triple)return triple.key;
 const s=quantitative(value).replace(/[“”]/g,'"').replace(/inches|inch/g,'in');
 const m=s.match(/(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*(ft|in|cm|")?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*-?\s*(ft|in|cm|")?/);
 if(!m)return null;
 const first=m[2]==='"'?'in':m[2],second=m[4]==='"'?'in':m[4];
 if(first&&second&&first!==second)return null;
 return [String(Number(m[1])),String(Number(m[3])),first||second||''].join('x');
}
function quantities(s){
 s=quantitative(s);const out={};const dimension=dimensions(s);if(dimension)out.dimension=dimension;
 const length=!dimension&&s.match(/(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)ft\b/);if(length)out.length=length[1];
 const volume=s.match(/(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)(floz|oz)\b/);if(volume)out[volume[2]]=volume[1];
 const pack=s.match(/\bpack(?:s)?\s+of\s+(\d+)\b|\b(\d+)[ -]*(?:pack|count)\b/);if(pack)out.pack=pack[1]||pack[2];
 return out;
}
const optionForm=s=>quantitative(s).replace(/\b(?:3\s*x[ -]*large|3xl|3x|xxx[ -]?large|xxxl|three[ -]*x[ -]*large)\b/g,'xxxlarge').replace(/\b(?:extra extra large|xx-large|xx large|xxl|2xl|2x)\b/g,'xxlarge').replace(/\b(?:extra large|x-large|x large|xl)\b/g,'xlarge').replace(/\s+/g,' ').trim();
const phraseForm=s=>canonical(optionForm(s)).replace(/[^a-z0-9.]+/g,' ').trim().replace(/\s+/g,' ');
const hasPhrase=(text,value)=>(' '+phraseForm(text)+' ').includes(' '+phraseForm(value)+' ');
const contentTokens=s=>phraseForm(s).split(' ').filter(w=>w.length>2&&!['the','and','with','for','color','colour','style','head','pump'].includes(w));
function waistLength(value){
 const s=norm(value);const pair=s.match(/\b(\d+(?:\.\d+)?)\s*w\s*(?:x|by|×)?\s*(\d+(?:\.\d+)?)\s*l\b/);
 if(pair)return pair[1]+'w x '+pair[2]+'l';
 const waist=s.match(/\b(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in|["”])?\s+waist\b/);
 const length=s.match(/\b(\d+(?:\.\d+)?)\s*(?:inch(?:es)?|in|["”])?\s+(?:length|inseam)\b/);
 return waist&&length?waist[1]+'w x '+length[1]+'l':'';
}
function requestedSize(instruction){
 const s=optionForm(instruction);
 const explicit=s.match(/\bsize(?:d)?\s+(?:is\s+)?(\d+(?:\.\d+)?(?:\s+(?:wide|narrow|medium))?|xxxlarge|xxlarge|xlarge|small|medium|large)\b/);
 if(explicit)return explicit[1];
 const before=s.match(/\b(\d+(?:\.\d+)?)\s+sized\b/);if(before)return before[1];
 return s.match(/\b(xxxlarge|xxlarge|xlarge|small|medium|large)\b/)?.[1]||'';
}
export function apply(ctx) {
 installResumeRole(ctx,name,resumeFeatures);
 ctx.on('benchmark/setup',async ({ac,audit,agent,getRawBusinessResult,getVisibleInput},next)=>{
  await next();let groups=[];let selected={};let issues=[];let blockingIssues=[];let latest=initialObservation(agent);let currentId='';let warningCount=0;let fortuneTypeIssue='';let flashCapacityIssue='';let truffleTypeIssue='';
  const selections=new Map();const warned=new Set();const roleShown=new Set();const cocoaShown=new Set();const dimensionShown=new Set();const ingredientShown=new Set();const fortuneShown=new Set();const flashShown=new Set();const truffleShown=new Set();const perfumeShown=new Set();
  ac.on('system-prompt/assemble',async (assembly,context,next)=>{
   const result=await next();const text='Product options must be explicitly clicked even when the title already mentions the desired variant. A cable length, package count or bottle volume in the instruction is a required selection if offered. Select every relevant group: clicking a size containing pack of 1 does not also select a separate style pack of 1. Only successful real function calls update the ledger. Use valid JSON with escaped quotation marks inside dimension strings. Match exact named colors and qualifiers; light blue is more specific than blue. Preserve full sizes: x-large is not large, 7 wide is not 7. Color ranges and either/or wording describe candidates and must not be forced into an all-colors condition. Compound dimensions require all sides in the same unit, not one matching number. Copy matching dimension function arguments exactly, with escaped quotes. A clicked value is evidence of an action, not proof the product satisfies the instruction. The conjunctions and and & are equivalent in a flavor name; preserve all flavor components. Preserve the complete requested flavor; a different named flavor cannot substitute. Buy once required selections are complete.';
   audit({method_id:name,hook:'system-prompt/assemble',call_id:null,text});
   return {...result,sections:[...result.sections,{name,order:26,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(call.name==='click_action'&&norm(args.value)==='buy now'&&(blockingIssues.length||fortuneTypeIssue||flashCapacityIssue||truffleTypeIssue)&&!warned.has(currentId)&&warningCount<2){
    warned.add(currentId);warningCount++;const reason=flashCapacityIssue?flashCapacityIssue+' Click < prev to inspect another USB drive or search for the requested GB capacity. This product will not be blocked again by this selection reminder.':truffleTypeIssue?truffleTypeIssue+' Click < prev to inspect an actual truffle product and its flavor choices. This product will not be blocked again by this selection reminder.':fortuneTypeIssue?fortuneTypeIssue+' Click < prev to return to results and inspect an actual fortune-cookie product, then check its pattern. This product will not be blocked again by this selection reminder.':blockingIssues.join(' ')+' Click a listed matching value; if unavailable, click < prev and inspect another product. This product will not be blocked again by this selection reminder.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }
   return decision;
  });
  ac.on('tools/post-execute',async (call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept')return decision;
   const receipt=getRawBusinessResult(call.callId);if(!receipt)return decision;const raw=rawText(result,receipt);const previous=latest;const before=actions(previous);latest=raw;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const clicked=norm(args?.value);
   const valid=receipt&&!receipt.error&&!result.isError&&!/invalid action/i.test(raw);
   if(call.name==='search_action'){groups=[];selected={};currentId='';issues=[];}
   if(call.name==='click_action'&&/Page \d+ \(Total results:/.test(previous)&&/^[a-z0-9]{10}$/.test(clicked)&&before.includes(clicked)&&valid){currentId=clicked;selected=selections.get(currentId)||{};selections.set(currentId,selected);groups=[];issues=[];}
   const replacements=[];
   if(valid&&before.includes(clicked))for(const g of groups)if(g.values.includes(clicked)){
    if(selected[g.label]&&selected[g.label]!==clicked)replacements.push(g.label+' changed from '+JSON.stringify(selected[g.label])+' to '+JSON.stringify(clicked)+'. Only '+JSON.stringify(clicked)+' is now selected in this group; the earlier value was replaced, not added as a second dimension or component.');
    selected[g.label]=clicked;
   }
   groups=productGroups(raw);issues=[];blockingIssues=[];fortuneTypeIssue='';flashCapacityIssue='';truffleTypeIssue='';
   const obs=raw.split('Available Actions:')[0];const instruction=norm(obs.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]);
   let roleAnnotation='';const device=requestedDevice(instruction);
   if(device&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)&&!roleShown.has(currentId)&&roleShown.size<2){
    const chunks=obs.split('[SEP]').map(s=>s.trim());const priceIndex=chunks.findIndex(s=>/^price:/i.test(s));const title=chunks[priceIndex-1]||'';const accessory=accessoryEvidence(title);
    if(accessory){
     roleShown.add(currentId);roleAnnotation='Current product-role mismatch for '+currentId+': the task requests a '+device+' itself, while the visible title identifies '+JSON.stringify(accessory.prefix)+' as a '+accessory.role+'. Compatibility with the requested device does not make this accessory the device or establish its manufacturer. Selecting a color or other option does not repair this product-type mismatch. Use < prev to return to results, or revise the search to the whole device while keeping the original features and price limit. No purchase has been established by this comparison.';
    }
   }
   if(wantsHotCocoa(instruction)&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)&&!cocoaShown.has(currentId)&&cocoaShown.size<2&&getVisibleInput().step<=14){
    const chunks=obs.split('[SEP]').map(s=>s.trim());const priceIndex=chunks.findIndex(s=>/^price:/i.test(s));const title=chunks[priceIndex-1]||'';const role=cocoaTitleRole(title);
    if(role&&role!=='cocoa drink'){
     cocoaShown.add(currentId);
     roleAnnotation+=(roleAnnotation?'\n':'')+'Hot-cocoa product-type mismatch for '+currentId+': the task requests hot chocolate, but the actual visible title identifies '+role+'. A matching pack count, gluten-free label or a chocolate flavor cannot establish that this product is a hot-cocoa drink. Use < prev to inspect a cocoa-drink title or another result page, then verify the requested flavor and package separately. This comparison uses the public title, does not block purchase, and is issued once for this product.';
    }
   }
   const fortuneGoal=fortuneCookieGoal(instruction);
   if(fortuneGoal&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)){
    const chunks=obs.split('[SEP]').map(s=>s.trim()),priceIndex=chunks.findIndex(s=>/^price:/i.test(s)),title=chunks[priceIndex-1]||'';
    const role=fortuneCookieRole(title);
    if(role==='edible decoration')fortuneTypeIssue='Fortune-cookie product-type conflict: this actual product title identifies edible decoration, while the task requests fortune cookies. A matching theme, Kosher label or pack selection does not turn glitter or sugar decoration into cookies.';
    if(role&&!fortuneShown.has(currentId)&&fortuneShown.size<2&&getVisibleInput().step<=14){
     fortuneShown.add(currentId);
     const patternChoices=fortuneGoal.pattern?groups.flatMap(g=>g.values.filter(v=>norm(v)===fortuneGoal.pattern).map(value=>({group:g.label,value}))):[];
     roleAnnotation+=(roleAnnotation?'\n':'')+'Fortune-cookie product and pattern status for '+currentId+': '+(fortuneTypeIssue?fortuneTypeIssue+' Use < prev to inspect an actual cookie product.': 'The actual title identifies fortune cookies. '+(fortuneGoal.pattern?'Requested pattern '+JSON.stringify(fortuneGoal.pattern)+'. '+(patternChoices.length?'Matching actual choices: '+patternChoices.map(v=>v.group+' '+JSON.stringify(v.value)+'; click '+JSON.stringify({value:v.value})).join('; ')+'. Select the pattern explicitly; a default title theme does not record a choice.':'No exact requested pattern option is established on this page. Inspect public pattern details once or return to another cookie; this does not prove absence from the whole search.'):'Retain all other original requirements.'));
    }
   }
   const flashGoal=flashDriveGoal(instruction);
   if(flashGoal&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)){
    const chunks=obs.split('[SEP]').map(s=>s.trim()),priceIndex=chunks.findIndex(s=>/^price:/i.test(s)),title=chunks[priceIndex-1]||'';
    const role=flashDriveTitleRole(title),capacities=gbCapacities(title),capacityGroups=groups.filter(g=>/^(capacity|size)/.test(g.label)&&g.values.some(v=>gbCapacities(v).length));
    const offered=capacityGroups.flatMap(g=>g.values.filter(v=>matchesFlashCapacity(v,flashGoal)).map(value=>({group:g.label,value})));
    if(role==='USB flash drive'&&capacities.length===1&&capacities[0]!==flashGoal.gb&&!offered.length&&getVisibleInput().step<=14)flashCapacityIssue='Explicit USB-drive capacity conflict: the task requires '+flashGoal.gb+' GB, while this actual product title specifies '+capacities[0]+' GB and no matching capacity choice is shown. USB version, transfer speed, pack count or price cannot replace the specified GB value.';
    if(!flashShown.has(currentId)&&flashShown.size<2&&getVisibleInput().step<=14){
     flashShown.add(currentId);
     roleAnnotation+=(roleAnnotation?'\n':'')+'USB-drive capacity receipt status for '+currentId+': required '+flashGoal.gb+' GB. '+(role&&role!=='USB flash drive'?'This actual title identifies a '+role+', not a USB pen drive; do not use its RAM or card capacity as drive evidence.':offered.length?'Full matching actual capacity choices: '+offered.map(v=>v.group+' '+JSON.stringify(v.value)+'; click '+JSON.stringify({value:v.value})).join('; ')+'. Select the exact offered value; GB spacing does not change the number.':flashCapacityIssue?flashCapacityIssue+' Return to another actual drive; reading this same fixed-capacity description again does not make it the requested capacity.':'Actual title capacity values: '+(capacities.length?capacities.join(', ')+' GB':'unverified')+'. No matching selectable capacity is established here; verify the explicit capacity evidence and all original requirements. A default title is not a recorded selection.')+' Only the explicitly requested storage capacity is being compared; computer RAM, memory-card form, speed and package quantity remain distinct.';
    }
   }
   const truffleTask=truffleGoal(instruction);
   if(truffleTask&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)){
    const chunks=obs.split('[SEP]').map(s=>s.trim()),priceIndex=chunks.findIndex(s=>/^price:/i.test(s)),title=chunks[priceIndex-1]||'';
    const role=truffleTitleRole(title),flavorGroups=groups.filter(g=>/^flavo[u]?r/.test(g.label));
    const offered=flavorGroups.flatMap(g=>truffleFlavorMatches(g.values,instruction).map(value=>({group:g.label,value})));
    if(role==='flavoring syrup'&&getVisibleInput().step<=14)truffleTypeIssue='Truffle-confection product-type conflict: this actual title identifies bottled flavoring syrup, while the instruction requests truffles. A sugar-free label, matching flavor or selected bottle count cannot establish the requested product type.';
    if(!truffleShown.has(currentId)&&truffleShown.size<2&&getVisibleInput().step<=14){
     truffleShown.add(currentId);
     roleAnnotation+=(roleAnnotation?'\n':'')+'Truffle-confection receipt status for '+currentId+': '+(truffleTypeIssue?truffleTypeIssue+' Return to the actual results and inspect a truffle product.':role==='truffle confection'?'The actual title identifies truffle confectionery.':'Truffle product type remains unverified from this title.')+' '+(offered.length?'Whole actual flavor values occurring in the original instruction: '+offered.map(v=>v.group+' '+JSON.stringify(v.value)+'; click '+JSON.stringify({value:v.value})).join('; ')+'. A title default is not a recorded flavor selection.':flavorGroups.length?'No complete requested flavor value is established in the actual flavor list; do not substitute the default or infer an unlisted flavor. Inspect another truffle product if needed.':'No flavor selection group is shown; the requested full flavor remains a separate evidence obligation.')+(truffleTask.sugarFree?(/\bsugar free\b/.test(foodPhrase(title))?' The actual title explicitly states sugar-free; this does not verify the flavor.':' Sugar-free evidence is still unconfirmed from this title. Low sugar and gluten free do not establish sugar free; inspect actual ingredients or features once if needed.'):'')+' Retain the original price limit and all other task requirements; no hidden nutritional or flavor evidence is inferred.';
    }
   }
   const perfumeGoal=namedPerfumeGoal(instruction);
   if(perfumeGoal&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)&&!perfumeShown.has(currentId)&&perfumeShown.size<2&&getVisibleInput().step<=14){
    perfumeShown.add(currentId);
    const chunks=obs.split('[SEP]').map(s=>s.trim()),priceIndex=chunks.findIndex(s=>/^price:/i.test(s)),title=chunks[priceIndex-1]||'';
    const role=perfumeTitleRole(title),named=containsPerfumeName(title,perfumeGoal);
    const offered=groups.filter(g=>/^(scent|fragrance|style)(?:$| )/.test(g.label)).flatMap(g=>g.values.filter(v=>containsPerfumeName(v,perfumeGoal)).map(value=>({group:g.label,value})));
    roleAnnotation+=(roleAnnotation?'\n':'')+'Named-perfume receipt status for '+currentId+': required literal name '+JSON.stringify(perfumeGoal.name)+'; original written volume '+JSON.stringify(perfumeGoal.writtenVolume)+'. '+(offered.length?'Actual offered name choices: '+offered.map(v=>v.group+' '+JSON.stringify(v.value)+'; click '+JSON.stringify({value:v.value})).join('; ')+'. A title default does not record this selection.':named&&role==='fragrance product'?'The actual fragrance-product title contains the requested name; volume and other requirements remain independent.':'The requested fragrance name is unverified in this actual title and its scent choices. '+(role==='other cosmetic'?'The title identifies another cosmetic product. ':'')+'A different perfume with a long-lasting aroma does not establish the requested named fragrance. Return with < prev to inspect an actual named fragrance from results.')+' Actual title volume wording: '+(visiblePerfumeVolumes(title).join(', ')||'unverified')+'. Compare the actual offered volume with the original task; this status does not convert units or repair ambiguous spelling. No selection or full match is established by reading the title.';
   }
   const target3=dimensions3(instruction);
   if(target3&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)&&!dimensionShown.has(currentId)&&dimensionShown.size<2&&getVisibleInput().step<=14){
    dimensionShown.add(currentId);
    const exact=groups.flatMap(g=>g.values.filter(v=>dimensions3(v)?.key===target3.key).map(v=>({group:g.label,value:v})));
    roleAnnotation+=(roleAnnotation?'\n':'')+'Three-axis selection status for '+currentId+': required '+target3.sides.join(' x ')+' '+target3.unit+'. '+(exact.length?'Full matching visible choices: '+exact.map(v=>v.group+' '+JSON.stringify(v.value)+'; exact click arguments '+JSON.stringify({value:v.value})).join(' ; ')+'. All three sides and the unit must match together; clicking two size values replaces the first rather than combining dimensions.':'No full three-axis size option is verified on this page. A matching color or only two matching sides does not verify the size. Check explicit dimensions in Features/Description at most once, or use < prev to inspect another product; absence here is not proof that the whole search has no match.');
   }
   const ingredientPair=readyIngredientPair(instruction);
   if(ingredientPair.length&&currentId&&/\[SEP\]\s*Buy Now/i.test(obs)&&!groups.some(g=>/^flavo[u]?r/.test(g.label))&&!ingredientShown.has(currentId)&&ingredientShown.size<2&&getVisibleInput().step<=14){
    ingredientShown.add(currentId);
    const chunks=obs.split('[SEP]').map(s=>s.trim()),priceIndex=chunks.findIndex(s=>/^price:/i.test(s)),title=chunks[priceIndex-1]||'';
    const missing=ingredientPair.filter(t=>!ingredientTokens(title).includes(t));
    if(missing.length)roleAnnotation+=(roleAnnotation?'\n':'')+'Ready-meal ingredient-pair status for '+currentId+': required '+ingredientPair.join(' AND ')+'. No selectable flavor group is shown, and this title does not verify '+missing.join(' and ')+'. One matching ingredient or the package count cannot stand for the pair. Inspect explicit ingredients once if needed, or use < prev for another meal with the complete recipe; no whole-search absence or purchase match is established.';
   }
   if(!groups.length){
    if(!roleAnnotation)return decision;
    audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:roleAnnotation});
    return {...decision,content:[...(decision.content||result.content),{type:'text',text:roleAnnotation}]};
   }
   const target=colorWords(instruction).map(canonical),wanted=quantities(instruction),instructionQuant=optionForm(instruction);
   const sizeWanted=requestedSize(instruction);const waistWanted=waistLength(instruction);const lashGoal=eyelashSpecGoal(instruction);
   const alternativeColors=/\beither\b|\bor\b|\b(?:brown|black|blonde|blue|red|green|grey|tan)\s+to\s+(?:brown|black|blonde|blue|red|green|grey|tan)\b/.test(instruction);
   blockingIssues=[];
   const rows=groups.map(g=>{
    let matches=[];let required=false;let absent='';let advisory='';let soft=false;
    const named=g.values.filter(v=>v.length>=3&&hasPhrase(instructionQuant,optionForm(v)));
    const exactNamed=named.filter(v=>!named.some(w=>w!==v&&hasPhrase(w,v)));
    const narrowed=named.length>exactNamed.length;
    if(/^flavo[u]?r/.test(g.label)&&explicitFlavor(instruction)){
     const flavor=explicitFlavor(instruction);required=true;matches=g.values.filter(v=>(' '+flavorKey(v)+' ').includes(' '+flavorKey(flavor)+' '));if(!matches.length)absent='Explicit requested flavor '+JSON.stringify(flavor)+' is not offered in this actual group. Return to results rather than substitute original or another flavor.';
    }else if(perfumeGoal&&/^(scent|fragrance|style)(?:$| )/.test(g.label)&&g.values.some(v=>containsPerfumeName(v,perfumeGoal))){
     required=true;matches=g.values.filter(v=>containsPerfumeName(v,perfumeGoal));
     advisory='Named fragrance identity selection: the actual value must contain the literal requested name '+JSON.stringify(perfumeGoal.name)+'. Selecting a bottle size or another scent does not also select this identity.';
    }else if(fortuneGoal?.pattern&&(/^pattern/.test(g.label)||g.values.some(v=>norm(v)===fortuneGoal.pattern))){
     required=true;matches=g.values.filter(v=>norm(v)===fortuneGoal.pattern);
     advisory='Explicit fortune-cookie pattern: '+JSON.stringify(fortuneGoal.pattern)+'. A holiday theme on a different product type or an unrelated pack choice does not establish this pattern selection.';
     if(!matches.length)absent='No exact requested pattern is listed in this actual group; inspect another cookie or explicit pattern evidence, retaining product type and other requirements.';
    }else if(truffleTask&&/^flavo[u]?r/.test(g.label)){
     matches=truffleFlavorMatches(g.values,instruction);required=matches.length>0;
     advisory='Truffle-confection flavor selection: match the complete actual flavor phrase in the original instruction. A default flavor or matching sugar-free label cannot replace a required flavor on an actual truffle product.';
     if(!matches.length)advisory+=' No literal full flavor choice is established here; retain the full flavor requirement when checking another product.';
    }else if(flashGoal&&/^(capacity|size)/.test(g.label)&&g.values.some(v=>gbCapacities(v).length)){
     required=true;matches=g.values.filter(v=>matchesFlashCapacity(v,flashGoal));
     advisory='USB-drive storage capacity: '+flashGoal.gb+' GB must match the complete GB value in one selected option. Whitespace does not change GB; a different number, transfer speed or pack count is not equivalent.';
     if(!matches.length)absent='The actual capacity group does not list the requested '+flashGoal.gb+' GB value; use < prev or a capacity-focused USB-drive search, retaining other requirements.';
    }else if(lashGoal&&g.values.some(v=>eyelashVariant(v))){
     required=true;matches=g.values.filter(v=>matchesEyelashSpec(v,lashGoal));
     advisory='Joint eyelash specification: diameter '+lashGoal.diameter+' mm AND complete length range '+lashGoal.low+'-'+lashGoal.high+' mm must be in the same actual selected value, regardless of this catalogue group label. A single endpoint is not the complete written range; curl is unspecified and is not an extra requirement.';
     if(matches.length)advisory+=' Exact matching click arguments: '+matches.slice(0,4).map(v=>JSON.stringify({value:v})).join(' or ')+'.';
     else absent='No complete requested diameter-and-range tuple is shown in this group. Check another product; a matching diameter alone does not establish the written length range.';
    }else if(/^flavo[u]?r/.test(g.label)&&ingredientPair.length){
     required=true;matches=g.values.filter(v=>ingredientPair.every(t=>ingredientTokens(v).includes(t)));
     advisory='Explicit ready-meal ingredient pair: '+ingredientPair.join(' AND ')+'. A city name or other recipe prefix does not remove the matching ingredients; both must occur in one selected flavor.';
     if(!matches.length)absent='No visible flavor contains both requested ingredients. Do not substitute a recipe containing only one; use < prev to inspect another meal or its actual ingredient evidence. Package count alone does not resolve this recipe requirement.';
    }else if(/^color/.test(g.label)){
     const combined=g.values.filter(v=>target.length&&target.every(c=>colorWords(canonical(v)).includes(c)));
     if(target.length>1&&!combined.length){
      matches=g.values.filter(v=>target.some(c=>colorWords(canonical(v)).includes(c)));soft=true;
      advisory='The instruction names multiple colors that occur as separate single-choice values. These are alternatives to interpret, not proof of an absent combined variant; each new click replaces this group selection.';
     }else if(exactNamed.length){
      matches=exactNamed.filter(v=>!exactNamed.some(w=>w!==v&&phraseForm(w).includes(phraseForm(v))));required=true;
     }else if(target.length){
      matches=g.values.filter(v=>(alternativeColors?target.some(c=>colorWords(canonical(v)).includes(c)):target.every(c=>colorWords(canonical(v)).includes(c))));
      soft=true;advisory='Basic-color overlap is approximate. Verify the entire named shade; do not replace a chosen named shade solely because another value contains a basic color word.';
      const taskTokens=new Set(contentTokens(instruction));
      const distinctive=v=>contentTokens(v).filter(w=>!colors.includes(w)&&taskTokens.has(w)).length;
      const best=Math.max(0,...g.values.map(distinctive));if(best>0)matches=g.values.filter(v=>distinctive(v)===best);
      if(!matches.length)absent='No automatic named-color match; compare the visible shades with the full instruction.';
     }
    }else{
     const quantityGroup=/^(size|length|capacity|volume|weight|item package quantity|number of items|package|style)(?:$| )/.test(g.label);
     const relevant=quantityGroup?Object.keys(wanted).filter(k=>g.values.some(v=>quantities(v)[k]!==undefined)):[];
     if(/^size(?:$| )/.test(g.label)&&waistWanted){
      required=true;matches=g.values.filter(v=>waistLength(v)===waistWanted);
      if(!matches.length)absent='The instruction requires waist and inseam together: '+waistWanted+'. No full pair is shown in this group. A single numeric size does not verify both fields, and clicking two numbers in this one group replaces the first. Inspect another product or its size details; do not infer a full pair from one matching number.';
     }
     else if(relevant.length){required=true;matches=g.values.filter(v=>relevant.every(k=>quantities(v)[k]===wanted[k]));if(!matches.length)absent='Required '+relevant.map(k=>k+'='+wanted[k]).join(', ')+' is absent in '+g.label+'.';}
     else if(/^size(?:$| )/.test(g.label)&&wanted.dimension){required=true;absent='The full requested dimensions '+wanted.dimension+' are not listed; a single matching side is insufficient.';}
     else if(/^size(?:$| )/.test(g.label)&&sizeWanted){required=true;matches=g.values.filter(v=>optionForm(v)===sizeWanted);if(!matches.length)absent='Explicit size '+sizeWanted+' is not listed in this group; do not substitute a partial size.';}
     else {
      matches=exactNamed;
      if(!matches.length&&/^(style|material|pattern)/.test(g.label)){
       const tokens=new Set(contentTokens(instruction));const overlap=v=>contentTokens(v).filter(w=>tokens.has(w)).length;
       const best=Math.max(0,...g.values.map(overlap));
       if(best>=2){matches=g.values.filter(v=>overlap(v)===best);soft=true;advisory='Requested features can be selectable in this group even when the instruction does not say style or material. These token-overlap candidates need semantic verification.';}
      }
     }
    }
    if(!/^color|^size/.test(g.label)&&matches.length>1&&selected[g.label]&&matches.every(v=>hasPhrase(selected[g.label],v))){
     matches=[selected[g.label]];advisory='The actually clicked combined value covers all matched components; retain it rather than replacing it with a shorter component.';
    }
    if(narrowed&&!/^color/.test(g.label)&&!advisory)advisory='The full named instruction phrase is preferred to a shorter contained option.';
    if(!soft&&(required||matches.length)){
     if(absent){issues.push(absent);if(/^flavo[u]?r/.test(g.label))blockingIssues.push(absent);}
     else if(!matches.includes(selected[g.label])){const issue=g.label+' still requires click: '+matches.map(v=>JSON.stringify(v)).join(' or ')+'.';issues.push(issue);blockingIssues.push(issue);}
    }
    const shown=[...new Set([...matches,...g.values])].slice(0,8);
    const exactCalls=matches.filter(v=>v.includes('"')).slice(0,2).map(v=>JSON.stringify({value:v}));
    return `${exactCalls.length?'Exact function arguments for matching dimensions: '+exactCalls.join(' or ')+'; ':''}${g.label}: ${advisory?advisory+' ':''}${selected[g.label]?'clicked '+JSON.stringify(selected[g.label]):'NOT CLICKED'}; ${matches.length?(soft?'advisory candidates (verify intended meaning): ':'instruction candidates: ')+matches.map(v=>JSON.stringify(v)).join(', '):absent||'compare with instruction'}; visible examples: ${shown.map(v=>JSON.stringify(v)).join(', ')}${g.values.length>shown.length?' (all '+g.values.length+' values remain in the original observation)':''}`;
   });
   const annotation='Option selection ledger from valid real execution receipts:\n'+rows.join('\n')+'\n'+(issues.length?'Pending instruction requirements: '+issues.join(' '):'No pending automatic match was found; this does not verify all instruction requirements. Check exact sizes, named colors and product features before purchasing.')+'\nTitle variants do not count as selected. Returning to a previously inspected product preserves its recorded clicks; missing variants require another product.'+(replacements.length?'\nSelection replacement confirmed by this real click: '+replacements.join(' '):'');
   const combinedAnnotation=annotation+(roleAnnotation?'\n'+roleAnnotation:'');
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:combinedAnnotation});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text:combinedAnnotation}]};
  });
 });
}
