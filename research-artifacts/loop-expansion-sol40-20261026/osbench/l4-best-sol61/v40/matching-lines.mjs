function rewrite(script,task){

  if(!/\b(count|number|total)\b/i.test(task)||!/\blines\b/i.test(task)||!/\b(contain|containing|match|matching)\b/i.test(task))return script;
  if(/\b(?:exclude|excluding)\b[^.!?]*\bfiles\b[^.!?]*\bcontain/i.test(task))return script;
  if(!/\|\s*(?:xargs\s+(?:-r\s+)?)?wc\s+-l\b/.test(script))return script;
  let changed=false;
  const result=script.replace(/\bgrep\b[^|;\n]*/g,segment=>segment.replace(/(^|\s)-([A-Za-z]*)l([A-Za-z]*)(?=\s|$)/g,(m,space,before,after)=>{
   changed=true;return space+'-'+before+'h'+after;
  }));
  return changed?result.replace(/\|\s*xargs\s+(?:-r\s+)?wc\s+-l\b/g,'| wc -l'):script;

}
export const name='matching-lines';
export function apply(ctx){
 const states=new Map();
 ctx.on('benchmark/setup',async(p,next)=>{
  await next(); const state={changed:false,audit:p.audit};p.audit({method_id:name,hook:'benchmark/setup',annotation:'Registered direct matching-line rewriting'});states.set(String(p.agent.session.id),state);
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.changed)return r;
   const text='Matching lines are counted with grep output, not the full contents of matching files. Continue from the actual corrected pipeline receipt.';
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
   if(/grep.*-l/.test(args.script))state.audit({method_id:name,hook:'llm/stream',annotation:'Inspect matching-line contract',task,script:args.script});
   const script=rewrite(args.script,task);
   if(script===args.script)continue;
   state.changed=true;changes.set(c.index,JSON.stringify({...args,script}));
   state.audit({method_id:name,hook:'llm/stream',annotation:'Normalize matching-line aggregation',before:args.script,after:script});
  }
  const sent=new Set();
  for(const c of chunks){const args=changes.get(c.index);
   if(args&&c.type==='tool-call-delta'){yield {...c,argumentsDelta:sent.has(c.index)?'':args};sent.add(c.index);}
   else if(args&&c.type==='block-end')yield {...c,block:{...c.block,arguments:args}};
   else yield c;
  }
 })());
}
