export const name="numeric-literal";
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let warned=false;const {ac,agent,audit}=p;
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||warned)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
  const question=task.split('Question:')[1]||'';
  if(!/^\s*(?:INSERT|UPDATE)\b/i.test(a.query))return d;
const values=[...question.matchAll(/["`]([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?)["`]/g)].map(m=>m[1]);
if(/^\s*UPDATE\b/i.test(a.query)&&! /\b(?:increase|decrease|improve|reduce)\b/i.test(question)){
 for(const m of question.matchAll(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?%/g))if(!values.includes(m[0]))values.push(m[0]);
}
const written=a.query.split(/\bWHERE\b/i)[0];
const changed=values.filter(v=>!written.includes(v)&&written.includes(v.replace(/[,%]/g,'')));
if(!changed.length)return d;
const reason='Numeric text fidelity: the task explicitly supplies formatted values '+JSON.stringify(changed)+', but this write removes their commas or percent signs. SELECT actual values for ALL corresponding target columns first and inspect the storage representation. Preserve each requested formatted value consistently, including thousands commas AND percent signs when the observed columns store them. Correct the entire SET group, not just one percentage, and execute the intended write. Do not normalize a formatted text value merely because its numeric magnitude is unchanged.';
  warned=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
