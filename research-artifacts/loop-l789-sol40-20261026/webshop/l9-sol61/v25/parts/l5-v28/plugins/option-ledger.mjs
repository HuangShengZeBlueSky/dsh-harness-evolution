export const name='option-ledger';
export function apply(ctx,config={}){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getRawBusinessResult,getVisibleInput}=p;
  let groups={},selected={},product='',task='',productPage=false;
  const deniedProducts=new Set();
  const controls=new Set(['back to search','< prev','description','features','reviews','buy now','next >','search']);
  const view=()=>Object.entries(groups).map(([g,vs])=>`${g}: ${selected[g]?'selected '+selected[g]:'NOT selected; choices '+vs.join(' | ')}`).join('\n');
  const numberWords={one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',eleven:'11',twelve:'12',thirteen:'13',fourteen:'14',fifteen:'15',sixteen:'16',seventeen:'17',eighteen:'18',nineteen:'19',twenty:'20'};
  const optionStops=new Set('i am looking searching trying find for a an the and or with that has have it its is are be my me some get want need would like buy show please should also choose pick ones one of to in on all color coloured colored size style name count pack packs piece pieces pc pcs set mm millimeter millimeters inch inches ft foot feet oz ounce ounces gb gig x l h w easy use high quality'.split(' '));
  const optionWords=text=>[...new Set((text.toLowerCase().replace(/\bgrey\b/g,'gray').replace(/\bx[ -]large\b/g,'xl').replace(/\bxx[ -]large\b/g,'xxl').replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g,w=>numberWords[w]).replace(/(\d)([a-z])/g,'$1 $2').replace(/([a-z])(\d)/g,'$1 $2').match(/\d+(?:\.\d+)?|[a-z]+/g)||[]).filter(w=>!optionStops.has(w)))];
  const literal=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  function namedChoices(group,values,core){
   return values.filter(value=>new RegExp(`\\b${literal(group)}(?:\\s*[:=]\\s*|\\s+(?:(?:is|equals?)\\s+)?)['"]?${literal(value)}['"]?(?=\\s*[,;.!?]?\\s*$|\\s+(?:and|with|that|which)\\b)`,'i').test(core));
  }
  function requestHints(){
   if(!config.requestCandidates||!productPage||!task)return '';
   const core=task.replace(/,?\s*and price lower than[\s\S]*/i,'');
   const wanted=new Set(optionWords(core));
   const explicitFlavor=core.match(/\bflavou?red\s+([^,.;]+)/i)?.[1]?.trim().toLowerCase();
   const lines=[];
   for(const [group,values]of Object.entries(groups)){
    const named=namedChoices(group,[...new Set(values)],core);
    const scored=[...new Set(values)].map(value=>{
     const matched=optionWords(value).filter(w=>wanted.has(w));
     const explicit=explicitFlavor&&value.toLowerCase()===explicitFlavor;
     const bound=named.length===1&&named[0]===value;
     return {value,matched,score:matched.length+(explicit?100:0)+(bound?200:0)};
    }).sort((a,b)=>b.score-a.score);
    const best=scored.filter(x=>x.score>0&&x.score===scored[0]?.score);
    if(!best.length||best.length===scored.length||best.length>4||best.some(x=>x.value===selected[group]))continue;
    const choices=best.map(x=>JSON.stringify({value:x.value})).join(' OR ');
    const terms=[...new Set(best.flatMap(x=>x.matched))].join(', ');
    lines.push(`${group}: instruction terms [${terms}]; current selection ${JSON.stringify(selected[group]??null)}. Candidate click_action arguments: ${choices}`);
   }
   if(!lines.length)return '';
   return 'REQUEST-LINKED OPTION CANDIDATES\n'+lines.join('\n')+'\nCompare the complete quantity, range and descriptive words, not only a short matching fragment or the default title. These are visible matching clues, not proof that all requirements hold. Use a real tool call with the exact JSON value shown; preserve escaped quotes. Other requirements still apply.\n';
  }
  // Fuse the non-auto checkout-loop checkpoint into the existing real option ledger.
  function exactPending(){
   const normalize=text=>text.toLowerCase().replace(/\bgrey\b/g,'gray').replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g,w=>numberWords[w]).replace(/[^a-z0-9.]+/g,' ').trim();
   const core=' '+normalize(task.replace(/,?\s*and price lower than[\s\S]*/i,''))+' ';
   const todo=[];
   for(const [group,values] of Object.entries(groups)){
    const matches=[...new Set(values)].map(value=>({value,key:normalize(value)})).filter(x=>x.key&&core.includes(' '+x.key+' '));
    const maximal=matches.filter(x=>!matches.some(y=>y.key!==x.key&&(' '+y.key+' ').includes(' '+x.key+' ')));
    if(!selected[group]&&maximal.length===1)todo.push({group,value:maximal[0].value});
   }
   return todo;
  }
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;
   if(call.name!=='click_action'||call.arguments?.value?.toLowerCase()!=='buy now'||!productPage||getVisibleInput().step>=17||deniedProducts.has(product))return decision;
   const todo=exactPending();if(!todo.length)return decision;
   deniedProducts.add(product);
   const reason='Requested options are visible but not yet selected: '+todo.map(x=>x.group+': click_action '+JSON.stringify({value:x.value})).join('; ')+'. Call these real options before buy now. The default title is not an actual option selection. Check the other original requirements and price as well.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason,product,pending:todo});return {kind:'deny',reason};
  });
  const guidance=()=>`SPECIFICATION LEDGER\n${view()}\n${requestHints()}For every explicit requirement, click its matching available option even when the title already mentions it. Option group labels can be misleading: color may contain light counts, styles or lengths. Choose the matching value by its meaning. Do not invent requirements for unspecified groups. A click leaves the page looking unchanged; the ledger remembers it. After all requested choices are selected, click buy now.`;
  ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();const text=guidance();audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};});
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept')return d;const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
   const text=raw.content;const value=call.arguments?.value;
   task=text.match(/Instruction:\s*\[SEP\]\s*(.*?)\s*\[SEP\]/s)?.[1]||task;
   productPage=(text.split('Available Actions:').pop()||'').includes("'buy now'");
   if(call.name==='search_action'||(call.name==='click_action'&&/^b[a-z0-9]{9}$/i.test(value||''))||value==='back to search') {groups={};selected={};product=value||'';}
   for(const [g,vs]of Object.entries(groups))if(vs.includes(value))selected[g]=value;
   const obs=text.split('Observation:\n')[1]?.split('\n\nAvailable Actions:')[0]||text;
   const parts=obs.split('[SEP]').map(s=>s.trim());const start=parts.indexOf('< Prev'),end=parts.findIndex(s=>s.startsWith('Price:'));
   if(start>=0&&end>start){
    const actions=text.split("'clickables': [")[1]?.split(']}')[0]||'';
    const available=[...actions.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map(m=>(m[1]??m[2]).replace(/\\(['"\\])/g,'$1'));let group=null;const found={};
    for(const part of parts.slice(start+1,end-1)){
     if(available.includes(part.toLowerCase())&&!controls.has(part.toLowerCase())){if(group)(found[group]??=[]).push(part.toLowerCase());}
     else if(part.length<40){group=part.toLowerCase();}
    }
    if(Object.keys(found).length)groups=found;
   }
   if(!Object.keys(groups).length)return d;
   const annotation=guidance();audit({method_id:name,hook:'tools/post-execute',annotation,product,selected,groups});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
