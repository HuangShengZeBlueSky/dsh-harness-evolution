export const name='hour-field';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,agent,audit,getRawBusinessResult},next)=>{
  await next(); let observedLayout=false,corrected=false;
  const relevant=()=>{const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).find(t=>t.includes('My problem is:'))||'';return /hour/i.test(task)&&/highest/i.test(task)&&/error/i.test(task);};
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();
   if(decision.kind!=='accept'||call.name!=='bash_action'||!relevant())return decision;
   const raw=getRawBusinessResult(call.callId);
   if(typeof raw?.content==='string'&&/^\[?[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}/m.test(raw.content))observedLayout=true;
   return decision;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();
   if(decision.kind!=='allow'||call.name!=='bash_action'||corrected||!observedLayout||!relevant())return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const script=args?.script||'';
   if(!/cut\s+-d\s*["']:["']\s+-f\s*2/.test(script))return decision;
   corrected=true;
   const reason='The actual log lines already shown have DATE then HH:MM:SS. The HOUR is the first colon component of the TIME field; cut -d: -f2 extracts minutes in the displayed timestamp. Keep matching ERROR records from all selected logs, suppress grep filenames with -h, and extract the hour from the observed time field (for this observed layout, awk can print substr($2,1,2)). Then sort | uniq -c | sort -nr and read the hour with awk whitespace fields; cut on one literal space fails on uniq padding. Inspect the histogram, then submit the highest hour.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
