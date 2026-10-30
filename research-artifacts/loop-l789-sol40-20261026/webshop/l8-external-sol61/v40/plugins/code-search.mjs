export const name='code-search';
const norm=s=>' '+String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit},next)=>{
  await next();let codes=[],query='',prompted=false,issued=false,unproved=false,blocked=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;
   if(call.name==='search_action'&&query&&!issued){const original=call.arguments.keywords;call.arguments={...call.arguments,keywords:query};issued=true;query='';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,annotation:'Focused code recovery search: '+JSON.stringify({original,executed:call.arguments.keywords})});}
   if(call.name==='click_action'&&String(call.arguments.value).toLowerCase()==='buy now'&&prompted&&unproved&&!blocked){blocked=true;const reason='Requested code '+JSON.stringify(codes)+' has not been demonstrated by this product title or visible variants. NEXT click_action value "back to search", then search the code together with the requested product type. Keep the exact code, color, size and budget.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return decision;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||result.isError)return decision;
   const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
   const task=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';if(!task)return decision;
   if(!codes.length)codes=[...new Set((task.toLowerCase().match(/\b[a-z0-9]+(?:-[a-z0-9]+)*\b/g)||[]).filter(x=>x.length>=6&&((x.match(/[a-z]/g)||[]).length>=3||/\d-[a-z]+\d/.test(x))&&/\d/.test(x)&&!/^\d+(?:x\d+)+(?:in(?:ches?)?|ft|cm|mm)?$/.test(x)&&!/^\d+(?:oz|ounces?|ml|gb|tb|ft|feet|in(?:ches?)?|cm|mm|packs?|count)$/.test(x)))];
   if(!codes.length)return decision;
   const tokens=raw.split('[SEP]').map(x=>x.trim());
   if(raw.includes('Total results:')){const titles=tokens.filter((x,i)=>i&&/^b[a-z0-9]{9}$/i.test(tokens[i-1]));unproved=!titles.some(t=>codes.every(c=>norm(t).includes(norm(c))));}
   else if(raw.includes('Price:'))unproved=!codes.every(c=>norm(tokens.slice(2).join(' ')).includes(norm(c)));
   else return decision;
   if(!unproved){query='';return decision;}
   if(prompted)return decision;prompted=true;query=codes.join(' ');
   const text='No current title or visible variant yet demonstrates requested code '+JSON.stringify(codes)+'. NEXT click_action value "back to search", then search_action keywords '+JSON.stringify(query)+'. Execute this focused query once and inspect actual new evidence. Keep the requested product type; a shared color, size or feature alone does not establish identity.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...decision,content:[...(decision.content||result.content),{type:'text',text}]};
  });
 });
}
