export const name='identity-cue';
const norm=s=>' '+s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit},next)=>{
  await next();
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();if(decision.kind!=='accept'||result.isError)return decision;
   const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
   if(!raw.includes('Total results:'))return decision;
   const task=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'';
   const ids=[...new Set((task.toLowerCase().match(/\b[a-z0-9]+(?:-[a-z0-9]+)*\b/g)||[]).filter(x=>/[a-z]/.test(x)&&/\d/.test(x)))];
   const tokens=raw.split('[SEP]').map(x=>x.trim());const candidates=[];
   for(let i=0;i<tokens.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(tokens[i]))candidates.push({value:tokens[i].toLowerCase(),title:tokens[i+1],price:tokens[i+2]});
   let matched,text;
   if(ids.length){
    matched=candidates.filter(c=>ids.every(id=>norm(c.title).includes(norm(id))));if(matched.length!==1)return decision;
    text='Exact identifier evidence: requested '+ids.map(x=>JSON.stringify(x)).join(', ')+'. Only this visible title contains every identifier: '+JSON.stringify(matched[0])+'. Inspect this candidate first. Keep the exact model/code; still check product type, required options and budget before buying.';
   }else{
    matched=candidates.filter(c=>{const word=c.title.match(/^[A-Z]{7,}\b/)?.[0];return word&&norm(task).includes(norm(word));});if(matched.length!==1)return decision;
    const word=matched[0].title.match(/^[A-Z]{7,}\b/)[0];
    text='Requested name evidence: '+JSON.stringify(word)+' occurs verbatim in the instruction and as this visible title leading name: '+JSON.stringify(matched[0])+'. Inspect this candidate first, then verify requested product type, exact options and budget. A matching name alone does not prove all requirements.';
   }
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text}]};
  });
 });
}
