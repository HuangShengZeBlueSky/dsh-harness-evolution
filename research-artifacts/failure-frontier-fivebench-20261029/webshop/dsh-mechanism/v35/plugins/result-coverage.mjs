export const name = 'result-coverage';
const stop = new Set('i am looking for a an the some to of and or with that is it in on my me want would like need buy find get please should be have has also make sure something perhaps can comes come choose pick sized size color colored price lower than dollars dollar less under'.split(' '));
function words(text) {
  return [...new Set(text.toLowerCase().replace(/hoddie|hoddies/g,'hoodie').replace(/hoods\b|hood\b/g,'hoodie').replace(/hoodies/g,'hoodie').replace(/\bmen[’']?s\b/g,'men').replace(/\bwomen[’']?s\b/g,'women').match(/[a-z]+\d+[a-z0-9]*|[a-z]+|\d+(?:\.\d+)?/g) || [])].filter(x => !stop.has(x)).map(x => x.length > 4 ? x.replace(/s$/,'') : x);
}
export function apply(ctx) {
 ctx.on('benchmark/setup', async ({ac,audit,getRawBusinessResult},next) => {
  await next();
  ac.on('tools/post-execute', async (call,result,next) => {
   const decision=await next(); if(decision.kind!=='accept') return decision;
   const raw=getRawBusinessResult(call.callId);
   const c=raw?.content ?? result.content;
   const text=typeof c==='string'?c:(c||[]).map(x=>x.text||'').join('\n');
   if(!text.includes('Total results:')) return decision;
   const tokens=text.split('[SEP]').map(x=>x.trim());
   const instruction=tokens[tokens.findIndex(x=>x.endsWith('Instruction:'))+1] || '';
   const goal=instruction.split(/,?\s*(?:and )?price (?:lower|less)/i)[0];
   const terms=words(goal);
   const models=terms.filter(t=>/^[a-z]+\d/.test(t));
   const upper=Number(instruction.match(/price (?:lower|less) than\s*([\d.]+)/i)?.[1] || Infinity);
   const rows=[];
   for(let i=0;i<tokens.length-2;i++) {
    if(!/^[A-Z0-9]{10}$/.test(tokens[i]) || !tokens[i+2].startsWith('$')) continue;
    const w=words(tokens[i+1]);
    rows.push({id:tokens[i].toLowerCase(),title:tokens[i+1],price:tokens[i+2],over:Number(tokens[i+2].match(/[\d.]+/)?.[0])>=upper,matched:terms.filter(x=>w.includes(x)),missing:terms.filter(x=>!w.includes(x))});
   }
   if(!rows.length) return decision;
   const weights=Object.fromEntries(terms.map(t=>[t,1+Math.log(1+rows.length/(1+rows.filter(r=>r.matched.includes(t)).length))]));
   for(const row of rows) row.score=row.matched.reduce((n,t)=>n+weights[t],0)-(row.over?100:0)+models.filter(t=>words(row.title).includes(t)).length*12;
   rows.sort((a,b)=>b.score-a.score);
   const annotation=(models.length?'Requested exact model identifiers: '+models.join(', ')+'. Shared numeric digits, wattage or capacity do not establish this model. Inspect a candidate explicitly naming the full identifier before accepting other feature overlap.\n':'')+'Search comparison from visible titles only. Strong lexical candidates to inspect:\n'+rows.slice(0,3).map(r=>r.id+' | '+r.title+' | '+r.price+(r.over?' OVER BUDGET':'')+(models.some(t=>!words(r.title).includes(t))?' MODEL NOT ESTABLISHED':'')+' | matched: '+r.matched.join(', ')+' | not established in title: '+r.missing.join(', ')).join('\n')+'\nCompare the complete requested product identity, fit, features and price, rather than choosing the cheapest partial match. Missing title words may be available as options or in features; verify them on the product page. If the visible candidates conflict with the required product type or fit, return to search and use a shorter product-focused query without price.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  });
 });
}
