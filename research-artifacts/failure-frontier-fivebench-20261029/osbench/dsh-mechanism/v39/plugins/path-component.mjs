export const name='path-component';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,agent,audit},next)=>{
  await next(); let corrected=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();
   if(decision.kind!=='allow'||call.name!=='bash_action'||corrected)return decision;
   const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).find(t=>t.includes('My problem is:'))||'';
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const script=args?.script||'';
   if(!/subdirectories named ["']?test/i.test(task)||!/\bfind\b/.test(script))return decision;
   const broadTest=/-path\s+["']\*test\*["']/.test(script);
   const lostLinks=/symbolic links/i.test(task)&&/-type\s+f/.test(script)&&!/find\s+-L\b|-type\s+l/.test(script);
   if(!broadTest&&!lostLinks)return decision;
   corrected=true;
   const reason='Selection must include the requested symbolic-link targets BEFORE counting. Default find ROOT -type f discards symlink entries; readlink -f afterwards cannot recover entries already discarded. For following links, put -L BEFORE the root: find -L ROOT -type f -name "*.py" ! -path "*/test/*" -exec cat {} + | wc -l. Alternatively explicitly select links and resolve their targets. Inspect the selected paths/targets so the intended files are counted correctly. Exclude the exact directory component test, not every name containing test. Keep comments and blank lines in the content count.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
