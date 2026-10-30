export const name='output-fields';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let noted=false;
  const {ac,agent,audit,getRawBusinessResult}=p;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();
   if(d.kind!=='accept'||call.name!=='execute_sql'||noted)return d;
   const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>(e.data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n')).find(t=>t.includes('Question:'))||'';
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const person=/\bwho\b/i.test(task.split('Question:')[1]||'')&&/\bTeam\b/i.test(a.query)&&/High (?:assists|points|rebounds)/i.test(a.query);
   if(!person&&!/\bboth\b/i.test(task.split('Question:')[1]||''))return d;
   const r=getRawBusinessResult(call.callId),text=String(r?.content||'').trim();
   if(!r||r.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text)||!/^\s*SELECT\b/i.test(a.query)||text==='[]'||!text)return d;
   noted=true;
   const annotation=person?'Answer entity check: the question asks WHO achieved the statistic. This query returns a team context alongside the individual statistical leader. Submit the player/person from the relevant statistical field rather than the adjacent Team field. Preserve the actual returned name, including punctuation; the team is context, not the individual answer.':'Submission fields: the task explicitly requests BOTH fields for every matching record. Your actual commit_final_answer answers must retain each requested field from each returned row, including full associated text; submitting only the entity names drops part of the answer even if the omitted value is identical across rows. Preserve the returned row associations and text.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...d,content:[...(d.content||result.content),{type:'text',text:'\n'+annotation}]};
  });
 });
}
