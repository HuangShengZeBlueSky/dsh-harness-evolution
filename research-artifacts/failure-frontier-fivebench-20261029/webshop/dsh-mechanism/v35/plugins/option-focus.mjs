export const name='option-focus';
const headings=new Set(['size','size name','color','color name','style','style name','design','flavor','flavor name','scent','scent name','pattern','pattern name','number of items','item package quantity','configuration','length','capacity','material','material type','shape']);
const stop=new Set('i m am my me looking want need would like also choose please some are that it should have has from a an the of with and in for to one color size sized style name pack count ounce ft inch inches'.split(' '));
function words(s){const nums={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,twelve:12};return [...new Set((s.toLowerCase().match(/[a-z]+|\d+(?:\.\d+)?/g)||[]).map(x=>String(nums[x]??x)).filter(x=>!stop.has(x)))];}
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next(); let title='', selected={};
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept')return decision;
  const raw=getRawBusinessResult(call.callId);if(raw?.error||result.isError)return decision;
  const c=raw?.content??result.content;const text=typeof c==='string'?c:(c||[]).map(x=>x.text||'').join('\n');
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(call.name==='search_action'||/^[a-z0-9]{10}$/i.test(args?.value||'')||args?.value==='back to search'){title='';selected={};}
  const tokens=text.split('[SEP]').map(x=>x.trim()),price=tokens.findIndex(x=>x.startsWith('Price:'));
  if(price<1||!tokens.includes('< Prev'))return decision;
  if(title!==tokens[price-1]){title=tokens[price-1];selected={};}
  const instruction=tokens[tokens.findIndex(x=>x.endsWith('Instruction:'))+1]||'';
  const goal=words(instruction.split(/price (?:lower|less)/i)[0]);
  const compound=instruction.match(/(\d+)'\s*(\d+)?\s*"?\s*(?:x|by)\s*(\d+)'\s*(\d+)?/i);
  const dimension=instruction.match(/(\d+(?:\.\d+)?)\s*(?:["']|inches?|ft|foot|feet)?\s*(?:x|by)\s*(\d+(?:\.\d+)?)/i);
  const capacity=instruction.match(/(\d+(?:\.\d+)?)\s*(ml|milliliters?|fl\s*oz|ounces?)/i);
  const scalar=/shoe|sandal|slipper|boot|sneaker/i.test(title)?instruction.match(/\bsize(?:d)?\s+(\d+(?:\.\d+)?)/i):null;
  const exactSize=value=>{
   if(scalar)return (value.match(/\d+(?:\.\d+)?/g)||[]).some(x=>Number(x)===Number(scalar[1]));
   if(compound){const m=value.match(/(\d+)'\s*(\d+)?\s*"?\s*x\s*(\d+)'\s*(\d+)?/i);return !!m&&Number(m[1])*12+Number(m[2]||0)===Number(compound[1])*12+Number(compound[2]||0)&&Number(m[3])*12+Number(m[4]||0)===Number(compound[3])*12+Number(compound[4]||0);}
   if(dimension){const n=value.match(/\d+(?:\.\d+)?/g)||[];return Number(n[0])===Number(dimension[1])&&Number(n[1])===Number(dimension[2]);}
   if(capacity){const unit=/^m/i.test(capacity[2])?'(?:ml|milliliters?)':'(?:fl\\s*oz|ounces?)';const values=[...value.matchAll(new RegExp('(\\d+(?:\\.\\d+)?)\\s*'+unit,'gi'))];if(values.length)return values.some(x=>Number(x[1])===Number(capacity[1]));}
   return true;
  };
  const groups={};let group=null;
  for(const t of tokens.slice(tokens.indexOf('< Prev')+1,price-1)){if(headings.has(t.toLowerCase())){group=t;groups[group]=[];}else if(group)groups[group].push(t);}
  const materialNorm=v=>v.toLowerCase().replace(/[- ]+/g,' ').replace(/quad shield/g,'quadshield').replace(/tri shield/g,'trishield');
  const materialTerms=materialNorm(instruction).match(/quadshield|trishield|solid copper/g)||[];
  const lines=[];
  for(const [key,values]of Object.entries(groups)){
   if(values.includes(args?.value))selected[key]=args.value;
   if(/color/i.test(key)&&values.length&&values.every(v=>/^[a-z]$/i.test(v))){
    const code=instruction.match(/\b([a-z])\s+colou?r\b/i)?.[1]?.toLowerCase();
    if(!code||!values.includes(code)){lines.push(key+': letter codes have no visible color mapping. Do not infer a code from words such as I in the instruction. Inspect details or another product for the requested color; title color alone does not map these codes.');continue;}
   }
   const score=v=>words(v).filter(t=>goal.includes(t)).length;
   const allowed=/material/i.test(key)&&materialTerms.length?values.filter(v=>materialTerms.every(t=>materialNorm(v).includes(t))):/size|capacity/i.test(key)?values.filter(exactSize):values;
   if(!allowed.length&&values.length){lines.push(key+': no visible option matches the requested size, dimensions or capacity. Do not substitute a different measurement; use < prev or inspect details.');continue;}
   const ranked=allowed.map(value=>({value,score:score(value)})).sort((a,b)=>b.score-a.score||a.value.length-b.value.length);
   if(!ranked.length||!ranked[0].score)continue;
   const best=ranked[0].score;
   if(selected[key]&&score(selected[key])>0&&allowed.includes(selected[key]))continue;
   const options=ranked.filter(r=>r.score===best).slice(0,3).map(r=>r.value);
   lines.push(key+': confirmed='+JSON.stringify(selected[key]??null)+'; task-matching options to consider='+JSON.stringify(options));
  }
  if(!lines.length)return decision;
  const annotation='Required option focus (from instruction and current page):\n'+lines.join('\n')+'\nThese groups still need checking against the complete request. Partial word overlap alone does not confirm the required variant. For a missing exact measurement, inspect another product. Click genuinely matching required options before buy now; the displayed product title does not select a variant. Only executed tool actions count. Do not select unrelated groups merely because they exist.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return{...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
});}
