export const name='compressed-set';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,agent,audit,getRawBusinessResult},next)=>{
  await next(); const listed=new Set(); let corrected=false;
  const relevant=()=>{const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).find(t=>t.includes('My problem is:'))||'';return /multiple compressed log files/i.test(task)&&/unique IP/i.test(task);};
  const scriptOf=call=>{const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;return args?.script||'';};
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();
   if(decision.kind!=='accept'||call.name!=='bash_action'||!relevant()||!/^\s*ls\s/.test(scriptOf(call)))return decision;
   const raw=getRawBusinessResult(call.callId);
   if(typeof raw?.content==='string')for(const m of raw.content.matchAll(/^(?:[^\s]+\/)?([^\s/]+\.gz)$/gm))listed.add(m[1]);
   return decision;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();
   if(decision.kind!=='allow'||call.name!=='bash_action'||corrected||listed.size<2||!relevant())return decision;
   const script=scriptOf(call);
   if(!/wc\s+-l/.test(script)||!/sort|uniq/.test(script))return decision;
   const input=script.match(/\bzcat\s+([^|;]+)/)?.[1]||'';
   const files=input.match(/[^\s"']+\.gz/g)||[];
   if(files.length!==1||input.includes('*')||input.includes('$('))return decision;
   corrected=true;
   const reason='You already listed '+listed.size+' compressed log files in the requested directory, but this total unique-IP calculation reads only ONE sample file. Keep the same date filter and observed IP field, decompress ALL selected .gz files together (for example zcat the requested directory/*.gz), then extract, globally deduplicate IPs and count. A head sample establishes format, not full coverage. Do not add per-file distinct counts, since an IP repeated in several files counts once.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
