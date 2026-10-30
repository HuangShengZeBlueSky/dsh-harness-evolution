export const name='size-recovery';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit},next)=>{
  await next();let missing='',blocked=false;const warned=new Set();
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;
   if(call.name==='click_action'&&String(call.arguments.value).toLowerCase()==='buy now'&&missing&&!blocked){
    blocked=true;const reason='Required shoe size '+missing+' is not listed on this product. NEXT click_action value "< prev" to return to results, then inspect a different shoe with the exact size; keep the requested shoe type and budget. Do not round the size.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }return decision;
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||result.isError)return decision;
   const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');missing='';
   if(!raw.includes('Price:')||!raw.includes('[SEP] Buy Now'))return decision;
   const task=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';
   if(!/\b(shoes?|sandals?|slippers?|heels?|pumps?|sneakers?)\b/i.test(task))return decision;
   const match=task.match(/\bsize (?:was |is |of )?(\d+(?:\.\d+)?)/i)||task.match(/\b(\d+(?:\.\d+)?) sized\b/i);if(!match)return decision;
   const wanted=match[1];const tokens=raw.split('[SEP]').map(x=>x.trim());const p=tokens.findIndex(x=>x.startsWith('Price:'));const title=tokens[p-1];const start=tokens.findIndex(x=>x.toLowerCase()==='size');if(start<0)return decision;
   const sizes=[];for(const x of tokens.slice(start+1,p-1)){if(!/^\d+(?:\.\d+)?$/.test(x))break;sizes.push(x);}
   if(!sizes.length||sizes.includes(wanted))return decision;missing=wanted;
   if(warned.has(title)||warned.size>=2)return decision;warned.add(title);
   const text='Exact shoe size mismatch: task requires '+wanted+'; this product lists '+JSON.stringify(sizes)+'. Neither a neighboring size nor an unrelated shoe type satisfies it. NEXT click_action value "< prev", then inspect another candidate with the exact size and requested shoe type within budget.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...decision,content:[...(decision.content||result.content),{type:'text',text}]};
  });
 });
}
