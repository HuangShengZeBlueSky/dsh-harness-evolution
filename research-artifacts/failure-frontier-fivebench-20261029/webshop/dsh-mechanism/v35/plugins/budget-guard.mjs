export const name='budget-guard';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();let page=null;const denied=new Set();
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;
 const raw=getRawBusinessResult(call.callId);if(raw?.error||result.isError)return d;
 const t=typeof raw?.content==='string'?raw.content:(result.content||[]).map(x=>x.text||'').join('\n');
 const tokens=t.split('[SEP]').map(x=>x.trim()),i=tokens.findIndex(x=>x.startsWith('Price:'));
 const instruction=tokens[tokens.findIndex(x=>x.endsWith('Instruction:'))+1]||'';
 page=i>0?{title:tokens[i-1],price:Number(tokens[i].match(/[\d.]+/)?.[0]),upper:Number(instruction.match(/price (?:lower|less) than\s*([\d.]+)/i)?.[1]||Infinity)}:null;return d;});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;
 const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
 if(call.name!=='click_action'||a?.value!=='buy now'||!page||page.price<page.upper||denied.has(page.title))return d;
 denied.add(page.title);const reason='Purchase check: visible price $'+page.price+' must be strictly lower than $'+page.upper+'. This product violates the budget. Click < prev to compare alternatives or back to search and search the requested product without price words. This reminder applies once per product; do not repeat the same purchase.';
 audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};});
});}
