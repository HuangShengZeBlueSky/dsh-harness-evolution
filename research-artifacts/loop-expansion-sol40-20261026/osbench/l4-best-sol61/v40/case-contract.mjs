function rewrite(script,task){
 if(!/\b(?:ignore|ignoring)\s+(?:the\s+)?case\b|\bcase[- ]insensitive\b/i.test(task))return script;
 if(/\bcase[- ]sensitive\b|\bdo not ignore case\b/i.test(task))return script;
 return script.replace(/\bgrep\s+([^|;\n]*)/g,(whole,tail)=>{
  if(/(?:^|\s)(?:--ignore-case\b|-[A-Za-z]*i[A-Za-z]*\b)/.test(tail))return whole;
  return 'grep -i '+tail;
 });
}
export const name='case-contract';
export function apply(ctx){
 const states=new Map();
 ctx.on('benchmark/setup',async(p,next)=>{
  await next(); const state={changed:false,audit:p.audit};states.set(String(p.agent.session.id),state);
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.changed)return r;
   const text='The visible task explicitly requires case-insensitive matching, so grep uses -i. Preserve all requested files and compute the required aggregate from actual results.';
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:27,text,interpolate:false}]};
  });
 });
 ctx.on('llm/stream',(options,next)=>(async function*(){
  const state=states.get(String(options.sessionId));if(!state){yield* next();return;}
  const chunks=[];for await(const c of next())chunks.push(c);
  const changes=new Map();
  for(const c of chunks){
   if(c.type!=='block-end'||c.block?.type!=='tool-call'||c.block.name!=='bash_action')continue;
   let args;try{args=typeof c.block.arguments==='string'?JSON.parse(c.block.arguments):c.block.arguments;}catch{continue;}
   if(typeof args?.script!=='string')continue;
   const task=options.messages.filter(m=>m.role==='user').flatMap(m=>m.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');
   const script=rewrite(args.script,task);
   if(script===args.script)continue;
   state.changed=true;changes.set(c.index,JSON.stringify({...args,script}));
   state.audit({method_id:name,hook:'llm/stream',annotation:'Apply explicit case-insensitive contract',before:args.script,after:script});
  }
  const sent=new Set();
  for(const c of chunks){const args=changes.get(c.index);
   if(args&&c.type==='tool-call-delta'){yield {...c,argumentsDelta:sent.has(c.index)?'':args};sent.add(c.index);}
   else if(args&&c.type==='block-end')yield {...c,block:{...c.block,arguments:args}};
   else yield c;
  }
 })());
}
