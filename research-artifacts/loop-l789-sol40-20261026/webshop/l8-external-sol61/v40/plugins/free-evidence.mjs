export const name='free-evidence';
const atom='(?:sulfates?|sulphates?|parabens?|alcohol|silicones?|silicon|dye|cruelty)';
const listPattern='\\b'+atom+'(?:\\s*(?:,|and|&)\\s*'+atom+')+\\s*[- ]*free\\b';
const canonical=s=>s.toLowerCase().replace('sulphate','sulfate').replace(/s$/,'');
function claims(text){const lower=String(text).toLowerCase(),found=new Set();
 for(const m of lower.matchAll(new RegExp('\\b('+atom+')[- ]+free\\b','g'))){if(/^\s+surfactants?\b/.test(lower.slice(m.index+m[0].length)))continue;found.add(canonical(m[1]));}
 for(const m of lower.matchAll(new RegExp(listPattern,'g'))){if(/^\s+surfactants?\b/.test(lower.slice(m.index+m[0].length)))continue;for(const a of m[0].matchAll(new RegExp(atom,'g')))found.add(canonical(a[0]));}return found;
}
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit},next)=>{await next();let emitted=false;
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept'||result.isError||emitted)return d;
  const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');if(!raw.includes('Total results:'))return d;
  const task=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';if(!new RegExp(listPattern,'i').test(task))return d;
  const required=[...claims(task)],categories=[...new Set(task.toLowerCase().match(/\b(?:shampoo|conditioner)\b/g)||[])];if(required.length<2||!categories.length)return d;
  const cap=Number(task.match(/price\s+(?:lower|less)\s+than\s*([\d.]+)/i)?.[1]||Infinity),tokens=raw.split('[SEP]').map(x=>x.trim()),matches=[];
  for(let i=0;i<tokens.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(tokens[i])){const title=tokens[i+1],price=tokens[i+2],low=Number(price.match(/\$([\d,.]+)/)?.[1]?.replaceAll(',','')),evidence=claims(title);if(!categories.every(c=>new RegExp('\\b'+c+'\\b','i').test(title)))continue;
   if(categories.length===1&&/\bshampoo\b/i.test(task)&&/\bconditioner\b/i.test(title))continue;
   if(required.every(p=>evidence.has(p))&&low<cap)matches.push({value:tokens[i].toLowerCase(),title,displayed_price:price,explicit_free_claims:required});
  }
  if(!matches.length)return d;emitted=true;const text='Shared free suffix means every listed requirement: '+JSON.stringify(required.map(x=>x+' free'))+'. Direct same-category title evidence, in visible result order: '+JSON.stringify(matches.slice(0,3))+'. Inspect the first of these direct-claim candidates, then verify actual product, options and budget. A phrase qualified as "sulfate-free surfactants" is narrower evidence than a direct whole-product sulfate-free declaration; this does not prove that other products fail the requirement.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};
 });
});}
