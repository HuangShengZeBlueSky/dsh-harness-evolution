export const name = 'option-ledger';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload,next) => {
    await next();
    const {ac,audit,getRawBusinessResult}=payload;
    let groups={}, selected={}, task='', onProduct=false, colorCorrected=false, unitCorrected=false, packCorrected=false, missingCorrected=false, sourceWarned=false;
    const hues=text=>[...new Set((String(text).toLowerCase().match(/\b(?:black|white|blue|pink|red|green|purple|yellow|orange|grey|gray|brown|beige|ivory|camo)\b/g)||[]).map(x=>x==='grey'?'gray':x))];
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();
      if(decision.kind!=='allow'||colorCorrected||!onProduct||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now'||!groups.color?.length)return decision;
      if(!/\bcolou?r(?:ed|ing)?\b|\bsky blue\b/i.test(task))return decision;
      const required=hues(task);
      if(required.length!==1)return decision;
      const wanted=required[0], options=groups.color, actual=hues(selected.color||'');
      const matches=options.filter(v=>hues(v).includes(wanted));
      const conflict=actual.length&&!actual.includes(wanted);
      const absent=!matches.length&&options.every(v=>hues(v).length);
      if(!conflict&&!absent)return decision;
      colorCorrected=true;
      const query=task.split(/,?\s*if possible/i)[0].replace(/,?\s*and price lower than.*$/i,'').replace(/^(?:i(?:'m| am) looking for|i would like|i want(?: to buy)?|i need|find me)\s+/i,'').trim();
      const reason=`The instruction requires the ${wanted} color family. Current actual color selection: ${JSON.stringify(selected.color||'none')}; available colors: ${JSON.stringify(options)}. ${matches.length?'Click a matching exact public value: '+JSON.stringify(matches):'This color group cannot provide the required color. Click back to search and search '+JSON.stringify(query)+', then choose another product.'} Keep the required product type, size and budget. An explicitly optional feature may be deferred, but do not substitute another color.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
    const labels=new Set(['color','size','style','style name','design','flavor name','flavor','scent name','scent','capacity','pattern name','item package quantity','configuration','material type','length','number of items']);
    const measures=text=>[...new Set([...String(text).toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(fl\s*oz|fluid\s*ounces?|ounces?|oz|grams?|g|pounds?|lbs?|milliliters?|ml)\b/g)].map(m=>{
      const u=m[2].replace(/\s/g,'');
      const unit=/^(?:fl|fluid)/.test(u)?'floz':/^(?:oz|ounce)/.test(u)?'oz':/^(?:g|gram)/.test(u)?'g':/^(?:lb|pound)/.test(u)?'lb':'ml';
      return `${Number(m[1])} ${unit}`;
    }))];
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();
      if(decision.kind!=='allow'||unitCorrected||!onProduct||!groups.size?.length||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now')return decision;
      const required=measures(task);
      if(required.length!==1)return decision;
      const matches=groups.size.filter(v=>measures(v).includes(required[0]));
      if(matches.length!==1||selected.size===matches[0])return decision;
      unitCorrected=true;
      const reason=`The instruction requests ${required[0]}. The unique exact matching public size value is ${JSON.stringify(matches[0])}, but it has not been successfully selected. Actual selected size: ${JSON.stringify(selected.size||'none')}. Click that exact available size now, preserve the other required options and pack quantity, then buy. Do not round a nearby number or construct a size from the title; an unchanged page after an unavailable click is not a selection.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
    });
    const packWords={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
    const packs=text=>{
      const normal=String(text).toLowerCase().replace(new RegExp('\\b('+Object.keys(packWords).join('|')+')\\b','g'),w=>packWords[w]);
      return [...new Set([...normal.matchAll(/\b(?:pack|set)\s+of\s+(\d+)\b|\b(\d+)\s*[- ]?\s*(?:packs?|count|pcs|pieces?)\b/g)].map(m=>Number(m[1]||m[2])))];
    };
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();
      if(decision.kind!=='allow'||packCorrected||!onProduct||!groups.size?.length||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now')return decision;
      const required=packs(task);if(required.length!==1)return decision;
      const wanted=required[0],actual=packs(selected.size||''),all=groups.size.map(packs),matches=groups.size.filter(v=>packs(v).includes(wanted));
      const wrong=actual.length===1&&actual[0]!==wanted;
      const absent=all.every(v=>v.length===1)&&!matches.length;
      if(!wrong&&!absent)return decision;
      packCorrected=true;
      const reason=`The instruction requires a package/set of ${wanted} items. Actual size selection: ${JSON.stringify(selected.size||'none')}; public size options: ${JSON.stringify(groups.size)}. ${matches.length?'Public options with the requested count: '+JSON.stringify(matches)+'. Check the other requested dimensions/weight before selecting an exact value.':'This size group has no matching count. Return to results or search for another product with the required count.'} Do not substitute a different quantity. Preserve product type, weight, length, flavor, material and budget.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
    });
    const ignored=new Set(['pack','of','ounce','ounces','oz','gram','grams','count','name','style','with','for','and','the','size','color','in','by','a','to','or']);
    const tokens=text=>[...new Set((String(text).toLowerCase().match(/[a-z]+/g)||[]).filter(w=>w.length>1&&!ignored.has(w)))];
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();
      if(decision.kind!=='allow'||missingCorrected||!onProduct||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now')return decision;
      const requested=new Set(tokens(task)),missing={};
      for(const group of ['flavor','flavor name','style','style name','design','material type']) {
        if(selected[group])continue;
        const ranked=(groups[group]||[]).map(value=>({value,score:tokens(value).filter(w=>requested.has(w)).length})).sort((a,b)=>b.score-a.score);
        if(ranked[0]?.score>=2&&(!ranked[1]||ranked[0].score>ranked[1].score))missing[group]=ranked[0].value;
      }
      if(!Object.keys(missing).length)return decision;
      missingCorrected=true;
      const reason=`These option groups are still UNSELECTED and have a unique strongest public match to multiple explicit request words: ${JSON.stringify(missing)}. Actual selections: ${JSON.stringify(selected)}. Select each applicable exact public value before buying, preserving all already selected groups, size and quantity. Do not replace an existing flavor/style choice merely because another option overlaps more words. Check the remaining required product properties as well.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
    });
    ac.on('tools/post-execute',async(call,result,next)=>{
      const decision=await next();
      if(decision.kind!=='accept')return decision;
      const raw=getRawBusinessResult(call.callId);
      if(!raw||raw.error)return decision;
      const value=String(call.arguments?.value||'').toLowerCase();
      if(call.name==='click_action') {
        if(/^[a-z0-9]{10}$/.test(value)||['back to search','< prev','next >'].includes(value)) {groups={};selected={};}
        else for(const [key,options] of Object.entries(groups))if(options.includes(value))selected[key]=value;
      }
      const parts=String(raw.content).split('Available Actions:')[0].trim().split('[SEP]').map(x=>x.trim());
      onProduct=parts.some(x=>x.startsWith('Price:'))&&parts.some(x=>x.toLowerCase()==='buy now');
      if(onProduct)task=parts[1]||'';
      const start=parts.findIndex(x=>x.toLowerCase()==='< prev');
      const price=parts.findIndex(x=>x.startsWith('Price:'));
      if(start<0||price<=start||!parts.some(x=>x.toLowerCase()==='buy now'))return decision;
      const found={};let group;
      for(const token of parts.slice(start+1,price-1)) {
        const low=token.toLowerCase();
        if(labels.has(low)){group=low;found[group]=[];}
        else if(group)found[group].push(low);
      }
      groups=found;
      if(!Object.keys(groups).length)return decision;
      let sourceHint='';
      if(!sourceWarned&&/\b(?:jerky|snack\s*sticks?|meat)\b/i.test(task)){
        const sources=t=>[...new Set(String(t).toLowerCase().match(/\b(?:beef|pork|chicken|turkey|venison|bison)\b/g)||[])],wanted=sources(task);
        for(const g of ['flavor','flavor name']){
          const actual=sources(selected[g]||''),matches=(groups[g]||[]).filter(v=>{const a=sources(v);return a.length===1&&a[0]===wanted[0];});
          if(wanted.length===1&&actual.length===1&&wanted[0]!==actual[0]&&matches.length){sourceWarned=true;sourceHint=`\nThe option just actually selected explicitly contains ${actual[0]}, but this meat-snack instruction requires ${wanted[0]}. Correct this confirmed source conflict using an exact public ${wanted[0]} option: ${JSON.stringify(matches)}. Preserve the other selected groups and all dietary, weight and budget requirements. Do not use the title's default flavor as the selected source.`;break;}
        }
      }
      const annotation=`Product option checklist: ${JSON.stringify(groups)}\nActually selected on this product: ${JSON.stringify(selected)}. A color, size or flavor written in the product title is NOT an option selection. Click each option explicitly requested by the instruction, using its exact clickable value, even when the title already contains it. Do not change a correct selected option or invent requirements for unrequested groups. If a required option is absent, choose another product. Once the requested options are selected, click buy now.`+sourceHint;
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
    });
  });
}
