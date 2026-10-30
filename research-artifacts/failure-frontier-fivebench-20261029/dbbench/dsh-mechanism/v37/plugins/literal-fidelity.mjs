export const name='literal-fidelity';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let warned=false;
  const {ac,agent,audit}=p;
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();
   if(d.kind!=='allow'||call.name!=='execute_sql'||warned)return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(!/^\s*(?:INSERT|UPDATE)\b/i.test(a.query))return d;
   const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
   const values=[...(task.split('Question:')[1]||'').matchAll(/"([^"\n]+)"/g)].map(m=>m[1]).filter(v=>/\s+,/.test(v));
   if(!values.some(v=>!a.query.includes(v)&&a.query.includes(v.replace(/\s+,/g,','))))return d;
   warned=true;
   const reason='Literal fidelity: this write removes spaces from an explicitly quoted task value. Preserve user-provided strings exactly, including spaces before commas, in this and remaining requested rows. Original values: '+JSON.stringify(values)+'. Correct the SQL string values and execute the intended write; do not normalize their punctuation.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
