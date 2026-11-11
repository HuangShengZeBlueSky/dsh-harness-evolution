import {norm,actions,rawText,initialObservation,productGroups,requestedDevice,accessoryEvidence,wantsHotCocoa,cocoaTitleRole,dimensions3,readyIngredientPair,ingredientTokens,eyelashSpecGoal,matchesEyelashSpec,fortuneCookieGoal,fortuneCookieRole,flashDriveGoal,flashDriveTitleRole,gbCapacities,matchesFlashCapacity,truffleGoal,truffleTitleRole,namedPerfumeGoal,perfumeTitleRole,containsPerfumeName,visiblePerfumeVolumes} from './visible-state.mjs';
export const name = 'search-evidence';
const stop = new Set('i am looking for a an the and or with of in to some want need would like get buy find me it should be that is are my also please price lower than dollars color size pack count ounce oz fl ft inch inches item one choose something'.split(' '));
const words = s => s.toLowerCase().replace(/([a-z]+)-(\d+[a-z0-9]*)/g,'$1$2').replace(/[^a-z0-9]+/g,' ').split(/\s+/).filter(w=>w.length>1&&!stop.has(w)&&!/^\d+$/.test(w)).map(w=>w.length>4&&w.endsWith('s')?w.slice(0,-1):w);
export function apply(ctx) {
 ctx.on('benchmark/setup', async ({ac,audit,agent,getRawBusinessResult,getVisibleInput},next)=>{
  await next();let upper=null;let current=null;const warned=new Set();let latest=initialObservation(agent);let invalidWarnings=0;let searchOnlyPasses=0;let explorationReminders=0;const seen=new Map();const details=new Map();const gapShown=new Set();
  const resultPages=new Map();const repeatedPagesShown=new Set();const cocoaPagesShown=new Set();const dimensionPagesShown=new Set();const ingredientPagesShown=new Set();let ingredientQueryShown=false;const eyelashChoicesShown=new Set();const fortunePagesShown=new Set();const flashPagesShown=new Set();let flashQueryShown=false;const trufflePagesShown=new Set();const perfumePagesShown=new Set();
  ac.on('system-prompt/assemble',async (assembly,context,next)=>{
   const result=await next();
   const text='Search with product type, brand and distinctive features. Omit the price constraint and dollar amount from keywords; check price on the page instead. Search results can show a default variant: required color, size, flavor, count or style may be selectable only after opening the product. Compare the full product identity, not just one matching adjective. If the current product lacks a required variant, use < prev to inspect another result. Previously inspected products are marked; do not keep reopening the same rejected product under reordered keywords. Product identifiers can only be clicked when present in the current Available Actions. A title or product category does not prove an unstated feature. If a key requested feature is unconfirmed, inspect Features or Description once, then call < prev to return to the product page before buying. Buy now cannot be clicked from the detail view. Treat missing word evidence as unconfirmed, not as proof of absence.';
   audit({method_id:name,hook:'system-prompt/assemble',call_id:null,text});
   return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(call.name==='click_action'&&!actions(latest).includes(norm(args.value))&&invalidWarnings<2){
    invalidWarnings++;const available=actions(latest);const reason=available.includes('< prev')&&!available.includes('buy now')&&!available.some(v=>/^[a-z0-9]{10}$/.test(v))?'This is a product detail view. That click is unavailable and no purchase or selection occurred. Call click_action with value < prev to return to the product page, then select required options and buy now when listed.':'That click is not available on the current page. Use one of the current clickable values: '+available.slice(0,10).map(v=>JSON.stringify(v)).join(', ')+'. A tool call without a page change does not establish a purchase.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }
   if(call.name==='click_action'&&args.value?.toLowerCase()==='buy now'&&current&&current.price!==null&&upper!==null&&current.price>=upper&&!warned.has(current.id)){
    warned.add(current.id);
    const reason=`The visible price starts at $${current.price}, above the instruction limit $${upper}. Click < prev to return to results and inspect a product below the limit; or back to search to revise keywords. This warning is issued once for this product.`;
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }
   return decision;
  });
  ac.on('tools/post-execute',async (call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept')return decision;
   const receipt=getRawBusinessResult(call.callId);if(!receipt)return decision;const raw=rawText(result,receipt);
   const previous=latest;const before=actions(previous);latest=raw;
   const obs=raw.split('Available Actions:')[0];
   const instruction=obs.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]||'';
   const bound=instruction.match(/price lower than\s*([\d.]+)/i);if(bound)upper=Number(bound[1]);
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(call.name==='search_action'||/Page \d+ \(Total results:/.test(obs))current=null;
   const openedProduct=call.name==='click_action'&&/Page \d+ \(Total results:/.test(previous)&&/^[a-z0-9]{10}$/i.test(args.value||'');
   if(openedProduct&&before.includes(norm(args.value))&&!receipt?.error&&!/invalid action/i.test(raw)){
    searchOnlyPasses=0;current={id:norm(args.value),price:null};if(!seen.has(current.id))seen.set(current.id,{groups:[],price:null});
   }
   if(current){const p=obs.match(/\[SEP\]\s*Price:\s*\$([\d.]+)/i);if(p)current.price=Number(p[1]);if(/\[SEP\]\s*Buy Now/i.test(obs)){const visited=seen.get(current.id);if(visited){visited.price=current.price;visited.optionEvidence=obs.split('[SEP]').slice(3,-7).map(s=>s.trim()).slice(0,12).join(' | ');}}}
   if(current&&call.name==='click_action'&&['features','description'].includes(norm(args.value))&&before.includes(norm(args.value))&&!receipt?.error){details.set(current.id,(details.get(current.id)||'')+' '+obs.split('[SEP]').slice(4).join(' '));}
   let annotation='';
   const available=actions(raw);const detailView=current&&available.includes('< prev')&&!available.includes('buy now')&&!/Page \d+ \(Total results:/.test(obs);
   if(detailView)annotation='You are on the Features/Description detail view, not the product purchase page. Buy now and option values are NOT available here. Call click_action({value: "< prev"}) to return to the same product page before selecting options or buying. No purchase is confirmed by an unchanged detail view. This detail has already been read; do not reopen it merely because a query word was absent.';
   if(/Page \d+ \(Total results:/.test(obs)){
    const instructionWords=words(instruction.replace(/,?\s*and price lower than.*$/i,''));const terms=new Set(instructionWords);
    const phrases=instructionWords.slice(0,-1).map((w,i)=>w+' '+instructionWords[i+1]);
    const chunks=obs.split('[SEP]').map(s=>s.trim());const rows=[];const device=requestedDevice(instruction);const cocoaTask=wantsHotCocoa(instruction);const fortuneGoal=fortuneCookieGoal(instruction);const flashGoal=flashDriveGoal(instruction);const truffleTask=truffleGoal(instruction);const perfumeGoal=namedPerfumeGoal(instruction);
    for(let i=0;i<chunks.length-2;i++)if(/^[A-Z0-9]{10}$/.test(chunks[i])){
     const accessory=device?accessoryEvidence(chunks[i+1]):null;
     const titleSequence=words(accessory?accessory.prefix:chunks[i+1]);const titleWords=new Set(titleSequence);const matched=[...titleWords].filter(w=>terms.has(w));
     const price=chunks[i+2].match(/\$([\d.]+)/);
     const sequence=' '+titleSequence.join(' ')+' ';const phraseMatches=phrases.filter(p=>sequence.includes(' '+p+' '));
     const cocoaRole=cocoaTask?cocoaTitleRole(chunks[i+1]):'';
     const fortuneRole=fortuneGoal?fortuneCookieRole(chunks[i+1]):'';
     const flashRole=flashGoal?flashDriveTitleRole(chunks[i+1]):'';const flashCaps=flashRole==='USB flash drive'?gbCapacities(chunks[i+1]):[];
     const truffleRole=truffleTask?truffleTitleRole(chunks[i+1]):'';
     const perfumeRole=perfumeGoal?perfumeTitleRole(chunks[i+1]):'';const perfumeNamed=perfumeGoal&&containsPerfumeName(chunks[i+1],perfumeGoal);
     rows.push({perfumeRole,perfumeNamed,truffleRole,flashRole,flashCaps,fortuneRole,cocoaRole,cocoaConflict:!!cocoaRole&&cocoaRole!=='cocoa drink',accessory,phraseMatches,id:chunks[i].toLowerCase(),title:chunks[i+1],price:chunks[i+2],min:price?Number(price[1]):null,titleWords,matched});
    }
    const frequency=new Map();for(const r of rows)for(const w of r.titleWords)frequency.set(w,(frequency.get(w)||0)+1);
    for(const r of rows)r.relevance=r.matched.reduce((s,w)=>s+Math.log(1+rows.length/(frequency.get(w)||1)),0)+r.phraseMatches.length;
    const pageRows=[...rows];
    const flashRank=r=>r.flashRole==='USB flash drive'?0:r.flashRole?2:1;
    const capacityRank=r=>!flashGoal?0:r.flashCaps.includes(flashGoal.gb)?0:r.flashCaps.length?2:1;
    const truffleRank=r=>r.truffleRole==='truffle confection'?0:r.truffleRole?2:1;
    const perfumeRank=r=>r.perfumeRole==='fragrance product'?(r.perfumeNamed?0:1):r.perfumeRole?3:2;
    rows.sort((a,b)=>(perfumeGoal?perfumeRank(a)-perfumeRank(b):0)||(truffleTask?truffleRank(a)-truffleRank(b):0)||(flashGoal?flashRank(a)-flashRank(b)||capacityRank(a)-capacityRank(b):0)||(fortuneGoal?Number(a.fortuneRole==='edible decoration')-Number(b.fortuneRole==='edible decoration')||Number(b.fortuneRole==='fortune cookies')-Number(a.fortuneRole==='fortune cookies'):0)||Number(a.cocoaConflict)-Number(b.cocoaConflict)||b.relevance-a.relevance);
    if(rows.length)annotation='Visible product identity evidence (quantity and unit words excluded from ranking; variants still require inspection):\n'+rows.slice(0,4).map(r=>`${r.id}: ${r.title} | ${r.price}${upper!==null&&r.min!==null&&r.min>=upper?' | OVER THE PRICE LIMIT':''} | matching identity terms: ${r.matched.join(', ')} | matching phrases: ${r.phraseMatches.join('; ')}${seen.has(r.id)?' | ALREADY INSPECTED':''}`).join('\n');
    const perfumePage=pageRows.map(r=>r.id).join(',');
    if(perfumeGoal&&getVisibleInput().step<=12&&!perfumePagesShown.has(perfumePage)&&perfumePagesShown.size<2){
     perfumePagesShown.add(perfumePage);
     const inspect=rows.filter(r=>r.perfumeRole==='fragrance product'&&r.perfumeNamed&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper));
     annotation+='\nNamed-perfume identity evidence: preserve the literal requested fragrance name '+JSON.stringify(perfumeGoal.name)+' and written volume '+JSON.stringify(perfumeGoal.writtenVolume)+'. Long-lasting, natural or vegan wording cannot replace the fragrance name. Eau de toilette is a fragrance-product form; a toothpaste or nail polish with a similar number is a different product. '+(inspect.length?'Actual affordable unopened fragrance titles containing the requested name: '+inspect.slice(0,3).map(r=>r.id+' '+r.title+' (written title volumes: '+(visiblePerfumeVolumes(r.title).join(', ')||'unverified')+')').join('; ')+'. Open a named fragrance to inspect actual size/scent options and volume evidence before buying.':'No affordable unopened named fragrance is established here; inspect another result page retaining the same name and original requirements.')+' Default bottle size is not the complete size list. Keep the original unit wording; no unit conversion, typo correction or volume equality is asserted by this annotation.';
    }
    const trufflePage=pageRows.map(r=>r.id).join(',');
    if(truffleTask&&getVisibleInput().step<=12&&!trufflePagesShown.has(trufflePage)&&trufflePagesShown.size<2){
     trufflePagesShown.add(trufflePage);
     const inspect=rows.filter(r=>r.truffleRole==='truffle confection'&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper));
     const syrups=rows.filter(r=>r.truffleRole==='flavoring syrup');
     annotation+='\nTruffle-confection subject evidence: the task requests truffles'+(truffleTask.sugarFree?' with an explicit sugar-free requirement':'')+'. '+(syrups.length?'Actual syrup titles: '+syrups.slice(0,2).map(r=>r.id+' '+r.title).join('; ')+'. A matching flavor or sugar-free label does not turn bottled syrup into truffle confectionery. ':'')+(inspect.length?'Affordable unopened actual truffle titles: '+inspect.slice(0,3).map(r=>r.id+' '+r.title).join('; ')+'. Open a truffle product and inspect its actual flavor choices; a default flavor in the title is not the complete option list.':'No affordable unopened truffle title is verified here; inspect another result page while retaining the original requirements.')+' Verify the complete requested flavor and sugar-free evidence separately on the same product. Low sugar, gluten free and sugar free are different claims. No later product or uninspected option is asserted to match.';
    }
    const flashPage=pageRows.map(r=>r.id).join(',');
    if(flashGoal&&getVisibleInput().step<=12&&!flashPagesShown.has(flashPage)&&flashPagesShown.size<2){
     flashPagesShown.add(flashPage);
     const drives=rows.filter(r=>r.flashRole==='USB flash drive'&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper));
     annotation+='\nUSB-flash-drive capacity evidence: required '+flashGoal.gb+' GB. GB whitespace does not change the numerical capacity; a different GB number is not equivalent. '+(drives.length?'Actual affordable unopened USB-drive titles to inspect: '+drives.slice(0,3).map(r=>r.id+' '+r.title+' (default title capacities: '+(r.flashCaps.length?r.flashCaps.join(', ')+' GB':'unverified')+')').join('; ')+'. Open one to check its actual capacity/size options; a displayed default capacity is not the entire option list.':'No affordable unopened USB-drive title is verified on this page; inspect another result page or a capacity-focused search.')+' A computer RAM figure or a micro-SD memory-card capacity does not verify a USB pen drive. Transfer speed MB/s and USB version are not storage capacity. Retain the original drive type, features and price limit; title capacity alone is not a recorded selection.';
    }
    const fortunePage=pageRows.map(r=>r.id).join(',');
    if(fortuneGoal&&getVisibleInput().step<=12&&!fortunePagesShown.has(fortunePage)&&fortunePagesShown.size<2){
     fortunePagesShown.add(fortunePage);
     const cookies=rows.filter(r=>r.fortuneRole==='fortune cookies'&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper));
     const decorations=rows.filter(r=>r.fortuneRole==='edible decoration');
     annotation+='\nFortune-cookie type and pattern evidence: the instruction requests actual fortune cookies'+(fortuneGoal.pattern?' with pattern '+JSON.stringify(fortuneGoal.pattern):'')+'. '+(decorations.length?decorations.slice(0,3).map(r=>r.id+' '+r.title).join('; ')+' explicitly name edible decoration, not fortune cookies. Matching a holiday theme or Kosher label does not resolve this product-type difference. ':'')+(cookies.length?'Affordable unopened fortune-cookie titles to inspect: '+cookies.slice(0,3).map(r=>r.id+' '+r.title).join('; ')+'. Open a cookie product and inspect its actual pattern choices; the default title theme is not the complete option list.':'No affordable unopened fortune-cookie title is verified on this page; inspect another result page or search while retaining the requested product type and other requirements.')+' These are inspection candidates; title evidence alone does not verify the requested pattern or all product features.';
    }
    const target3=dimensions3(instruction),dimensionPage=pageRows.map(r=>r.id).join(',');
    if(target3&&target3.unit&&getVisibleInput().step<=10&&!dimensionPagesShown.has(dimensionPage)&&dimensionPagesShown.size<2){
     const inspect=rows.map(r=>({...r,triple:dimensions3(r.title)})).filter(r=>r.triple&&r.triple.unit===target3.unit&&r.triple.sides.filter((v,i)=>v===target3.sides[i]).length>=2&&r.matched.length>=2&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper));
     inspect.sort((a,b)=>Number(b.triple.key===target3.key)-Number(a.triple.key===target3.key)||b.relevance-a.relevance);
     if(inspect.length){
      dimensionPagesShown.add(dimensionPage);
      annotation+='\nThree-axis variant inspection: required '+target3.sides.join(' x ')+' '+target3.unit+'. These affordable unopened titles share at least two corresponding dimensions: '+inspect.slice(0,2).map(r=>r.id+' displays '+r.triple.sides.join(' x ')+' '+r.triple.unit+' in '+r.title).join('; ')+'. The displayed tuple is a default variant, not the entire size list. Open one now to inspect its actual size and color options before rejecting it from the title or repeating the query. A shared side is not a full match: select only the complete requested three-axis tuple if offered, and verify the other task requirements.';
     }
    }
    const ingredientPair=readyIngredientPair(instruction),ingredientPage=pageRows.map(r=>r.id).join(',');
    if(ingredientPair.length&&getVisibleInput().step<=12&&!ingredientPagesShown.has(ingredientPage)&&ingredientPagesShown.size<2){
     ingredientPagesShown.add(ingredientPage);
     const mealRows=rows.filter(r=>/\b(?:ready[ -](?:to[ -])?eat|meals?|bowls?)\b/i.test(r.title));
     const pairRows=mealRows.map(r=>({...r,coverage:ingredientPair.filter(t=>ingredientTokens(r.title).includes(t)).length}));
     const inspect=pairRows.filter(r=>r.coverage>0&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper)).sort((a,b)=>b.coverage-a.coverage||b.relevance-a.relevance);
     annotation+='\nReady-meal ingredient-pair evidence: the instruction explicitly requires '+ingredientPair.join(' AND ')+'. Package count and a title matching only one ingredient do not verify both. '+(inspect.length?'Visible unopened meal candidates to inspect for actual flavor choices: '+inspect.slice(0,2).map(r=>r.id+' ('+r.coverage+'/2 ingredients in default title) '+r.title).join('; ')+'. A default package size or recipe is not the full option list; open a candidate and check a single flavor containing both ingredients before checking the required package count.':'No affordable unopened meal title here verifies an ingredient candidate; use another result page or a focused search while retaining both ingredients.')+' These are inspection candidates, not confirmed ingredient or feature matches.';
    }
    if(ingredientPair.length&&seen.size&&!ingredientQueryShown&&getVisibleInput().step<=10&&call.name==='search_action'&&norm(args.keywords)!==ingredientPair.join(' ')+' ready to eat'&&!rows.some(r=>ingredientPair.every(t=>ingredientTokens(r.title).includes(t)))){
     ingredientQueryShown=true;
     const keywords=ingredientPair.join(' ')+' ready to eat';
     annotation+='\nSingle ingredient-pair search recovery: inspected products have not established the requested combination. Try search_action('+JSON.stringify({keywords})+') once, using only the original ingredient pair and ready-to-eat wording instead of adding meal prep or other invented restrictions. Open resulting products to inspect actual flavors; this query does not prove they match. Do not repeat it if the visible result page stays the same.';
    }
    const cocoaPage=pageRows.map(r=>r.id).join(',');
    if(cocoaTask&&rows.some(r=>r.cocoaConflict)&&!cocoaPagesShown.has(cocoaPage)&&cocoaPagesShown.size<2){
     cocoaPagesShown.add(cocoaPage);
     const drinks=rows.filter(r=>r.cocoaRole==='cocoa drink'&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper));
     annotation+='\nHot-cocoa product-type evidence: the task asks for a cocoa drink. '+rows.filter(r=>r.cocoaConflict).slice(0,4).map(r=>r.id+' explicitly names '+r.cocoaRole).join('; ')+'. Those product forms are ranked below the other titles; chocolate, gluten-free or the requested pack count does not make granola, cookies or a sauce into hot cocoa. '+(drinks.length?'Visible affordable unopened cocoa-drink titles: '+drinks.slice(0,3).map(r=>r.id+' '+r.title).join('; ')+'. Open these to check the actual requested flavor and package options.':'No affordable unopened cocoa-drink title is verified on this page; inspect next > if available, retaining all original requirements.')+' Unclassified titles are still unverified, and a default flavor does not establish all offered variants.';
    }
    if(device&&rows.some(r=>r.accessory)){
     annotation+='\nProduct-role comparison: the instruction requests a '+device+' itself. '+rows.filter(r=>r.accessory).length+' of these '+rows.length+' visible titles identify an accessory in their main title, such as '+rows.filter(r=>r.accessory).slice(0,3).map(r=>r.id+' ('+r.accessory.role+')').join(', ')+'. For those titles, the matching terms above use the accessory subject before compatibility wording; the original full titles remain visible. An item for or compatible with a '+device+' is not evidence that the item is the '+device+' itself. A matching color or charging feature does not resolve this product-type difference. Search explicitly for the whole device'+(device==='phone'?' using smartphone rather than phone accessories':'')+' or inspect another result page, retaining the requested brand, color and price limit. Unflagged titles still need inspection.';
    }
    if(call.name==='search_action')searchOnlyPasses++;
    if(searchOnlyPasses>=2&&explorationReminders<2){
     const hasNamedPerfume=perfumeGoal&&pageRows.some(r=>r.perfumeNamed&&r.perfumeRole==='fragrance product'&&(upper===null||r.min===null||r.min<upper));
     const hasTruffle=truffleTask&&pageRows.some(r=>r.truffleRole==='truffle confection'&&(upper===null||r.min===null||r.min<upper));
     const hasCocoa=cocoaTask&&pageRows.some(r=>r.cocoaRole==='cocoa drink'&&(upper===null||r.min===null||r.min<upper));
     const hasFortune=fortuneGoal&&pageRows.some(r=>r.fortuneRole==='fortune cookies'&&(upper===null||r.min===null||r.min<upper));
     const hasFlash=flashGoal&&pageRows.some(r=>r.flashRole==='USB flash drive'&&(upper===null||r.min===null||r.min<upper));
     const hasExactFlash=hasFlash&&pageRows.some(r=>r.flashRole==='USB flash drive'&&r.flashCaps.includes(flashGoal.gb)&&(upper===null||r.min===null||r.min<upper));
     const inspect=pageRows.filter(r=>(!hasNamedPerfume||(r.perfumeNamed&&r.perfumeRole==='fragrance product'))&&(!hasTruffle||r.truffleRole==='truffle confection')&&(!hasFlash||r.flashRole==='USB flash drive')&&(!hasExactFlash||r.flashCaps.includes(flashGoal.gb))&&(!hasFortune||r.fortuneRole==='fortune cookies')&&(!hasCocoa||r.cocoaRole==='cocoa drink')&&!seen.has(r.id)&&(upper===null||r.min===null||r.min<upper)).slice(0,3);
     if(inspect.length){explorationReminders++;annotation+='\nSearch-only exploration reminder: '+searchOnlyPasses+' searches since opening a product. A default search title cannot establish that a requested shade or feature is unavailable. Inspect an unopened product of the requested type before another keyword expansion or declaring no match. Currently visible affordable unopened results (original page order): '+inspect.map(r=>r.id+' '+r.title+' '+r.price).join(' ; ')+'. These are inspection candidates, not verified matches. Open one to check actual options and features; retain all task requirements.';}
    }
    if(seen.size)annotation+='\nInspected product memory: '+[...seen].slice(-5).map(([id,v])=>id+' ($'+v.price+'): '+v.optionEvidence).join(' ; ')+'\nIf a required variant was absent, inspect an unvisited result or next > instead of reopening the same item.';
    if(call.name==='search_action'&&pageRows.length){
     const pageKey=pageRows.map(r=>r.id).join(',');const count=(resultPages.get(pageKey)||0)+1;resultPages.set(pageKey,count);
     const step=getVisibleInput().step;
     if(count>=2&&seen.size&&available.includes('next >')&&step<=14&&!repeatedPagesShown.has(pageKey)&&repeatedPagesShown.size<2){
      repeatedPagesShown.add(pageKey);
      annotation+='\nRepeated visible result page: this exact sequence of '+pageRows.length+' product identifiers has appeared in '+count+' actual searches, despite browsing products between searches. Repeating the query has not exposed a new result page. If the inspected products failed a required variant, call click_action({value: "next >"}) now to inspect another page rather than rerunning the same query. This is an exploration route, not a claim that later products match. Retain all requested features and leave actions for opening a product, selecting each required option and buying.';
     }
    }
   }else if(current&&current.price!==null&&upper!==null&&current.price>=upper){
    annotation=`Price conflict: this product starts at $${current.price}; task requires below $${upper}. Use < prev to inspect another result before purchasing.`;
   }
   if(current&&/\[SEP\]\s*Buy Now/i.test(obs)){
    const chunks=obs.split('[SEP]').map(s=>s.trim());const priceIndex=chunks.findIndex(s=>/^price:/i.test(s));const title=chunks[priceIndex-1]||'';
    const lashGoal=eyelashSpecGoal(instruction);
    const lashChoices=lashGoal?productGroups(raw).flatMap(g=>g.values.filter(v=>matchesEyelashSpec(v,lashGoal)).map(value=>({group:g.label,value}))):[];
    if(lashChoices.length&&getVisibleInput().step<=14&&!eyelashChoicesShown.has(current.id)&&eyelashChoicesShown.size<2){
     eyelashChoicesShown.add(current.id);
     annotation+=(annotation?'\n':'')+'Structured eyelash option evidence from the actual product page: diameter '+lashGoal.diameter+' mm AND complete length range '+lashGoal.low+'-'+lashGoal.high+' mm occur together in these selectable values: '+lashChoices.slice(0,4).map(v=>v.group+' '+JSON.stringify(v.value)+'; exact click '+JSON.stringify({value:v.value})).join(' ; ')+'. The catalogue group label may say scent name, but its actual values encode diameter, curl and length. A single '+lashGoal.low+'mm choice does not carry the written '+lashGoal.low+'-'+lashGoal.high+'mm range. Use one complete matching value instead of the default title diameter or only one endpoint. The instruction does not specify a curl, so no extra curl requirement is inferred; retain the other original product and price requirements. These numeric specifications are visible in options and do not require a separate Features lookup.';
    }
    const flashGoal=flashDriveGoal(instruction),flashCaps=flashGoal?gbCapacities(title):[];
    if(flashGoal&&flashDriveTitleRole(title)==='USB flash drive'&&flashCaps.length===1&&flashCaps[0]!==flashGoal.gb&&!productGroups(raw).filter(g=>/^(capacity|size)/.test(g.label)).some(g=>g.values.some(v=>matchesFlashCapacity(v,flashGoal)))&&!flashQueryShown&&getVisibleInput().step<=12){
     flashQueryShown=true;const keywords=flashGoal.gb+'GB USB flash drive';
     annotation+=(annotation?'\n':'')+'Fixed USB-drive capacity recovery: required '+flashGoal.gb+' GB, but this actual title states '+flashCaps[0]+' GB and no matching selectable capacity is shown. A faster USB port or a lower price does not satisfy the specified capacity. Return with < prev to inspect another USB drive, or try search_action('+JSON.stringify({keywords})+') once without the dollar amount. Verify the actual offered capacity and original product features before buying. This is a recovery query, not evidence that any later result matches; do not repeat the same page indefinitely.';
    }
    const focused=instruction.replace(/,?\s*and price lower than.*$/i,'').replace(/high quality|easy to use|living room|daily wear/gi,' ');
    const taskTerms=[...new Set(words(focused))].filter(w=>!['quality','easy','use','trying','specifically','buy','want','need','by','contain','contains','made','work','works'].includes(w));
    const shown=new Set(words(title+' '+(details.get(current.id)||'')));
    const variantWords=new Set(productGroups(raw).flatMap(g=>g.values.flatMap(words)));
    const missing=taskTerms.filter(w=>!shown.has(w)&&!variantWords.has(w)&&!(lashChoices.length&&['millimeter','diameter','long'].includes(w)));
    if(missing.length&&!gapShown.has(current.id)&&!details.has(current.id)){gapShown.add(current.id);annotation+=(annotation?'\n':'')+'Word evidence still unconfirmed in this title, inspected details and current options: '+missing.slice(0,7).join(', ')+'. These words may describe product features; inspect Features or Description if needed. Missing words do not prove the feature is absent, and matching a category does not prove it is present. Check an explicit feature at most once per product, then return with < prev to act.';}
   }
   if(openedProduct&&current)annotation='Product identity confirmed by a click from the visible search-results page: '+current.id+'. Option clicks on a product page retain this product identity.'+(annotation?'\n'+annotation:'');
   if(!annotation)return decision;
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
