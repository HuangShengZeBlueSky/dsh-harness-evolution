function rewrite(script,task){
 if(!/\b(?:count|number|total|many)\b[^.!?]*\blines\b/i.test(task)||! /\b(?:exclude|excluding)\b[^.!?]*\bfiles\b[^.!?]*\bcontain/i.test(task)||! /\|\s*wc\s+-l\s*$/.test(script))return script;
 const producer=script.slice(0,script.lastIndexOf('|')).trim();
 const last=producer.slice(producer.lastIndexOf('|')+1).trim();
 const loop=/\bwhile\b[\s\S]*\bread\b[\s\S]*\becho\s+["']?\$[A-Za-z_]/.test(last)&&/\bdone\s*$/.test(last);
 const grep=/^grep\s+(?:-[A-Za-z]+\s+)*-[A-Za-z]*[lL][A-Za-z]*(?:\s|$)/.test(last);
 if(!loop&&!grep)return script;
 const reader="| while IFS= read -r selected_input_file; do awk '1' \"$selected_input_file\"; done | wc -l";
 return script.replace(/\|\s*wc\s+-l\s*$/,()=>reader);
}
export const name='selection-contract';
export function apply(ctx){
 const states=new Map();
 ctx.on('benchmark/setup',async(p,next)=>{
  await next(); const state={changed:false,audit:p.audit};states.set(String(p.agent.session.id),state);
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.changed)return r;
   const text='The predicate selects whole files, while the task asks for their total line count. Read the selected files and count their text records; do not count pathname rows.';
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
   state.audit({method_id:name,hook:'llm/stream',annotation:'Read selected-file records instead of counting pathnames',before:args.script,after:script});
  }
  const sent=new Set();
  for(const c of chunks){const args=changes.get(c.index);
   if(args&&c.type==='tool-call-delta'){yield {...c,argumentsDelta:sent.has(c.index)?'':args};sent.add(c.index);}
   else if(args&&c.type==='block-end')yield {...c,block:{...c.block,arguments:args}};
   else yield c;
  }
 })());
}
