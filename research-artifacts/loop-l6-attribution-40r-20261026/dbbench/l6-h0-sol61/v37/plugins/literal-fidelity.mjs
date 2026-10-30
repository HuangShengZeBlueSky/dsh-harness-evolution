export const name='literal-fidelity';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   const users=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message');
   const first=users[0]?.data?.content||[];
   const initial=first.filter(b=>b.type==='text').map(b=>b.text).join('\n');
   const question=initial.includes('Question:')?initial.split('Question:').slice(1).join('Question:'):String(p.taskContext?.description||initial);
   if(!/\b(add|insert|update|correct|change|record|append|set|modify)\b/i.test(question))return r;
   const text='Storage fidelity: copy explicitly specified data strings exactly into INSERT/UPDATE values. Preserve spaces around punctuation, comma separators, percent signs, trailing decimal zeroes, and the exact dash character. Do not normalize explicit strings into bare numbers or a different date format. Empty TEXT means the empty string (two single quotes), not SQL NULL, unless NULL is explicitly requested. If existing storage format or the relevant column is unclear, inspect a few relevant rows before writing. Preserve already-correct fields.';
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};
  });
 });
}
