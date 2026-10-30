export function installRewrite(ctx,name,transform,tip) {
 const states=new Map();
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const state={task:'',changed:0,audit:p.audit,agentId:String(p.agent.session.id)};states.set(String(p.agent.session.id),state);
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   state.task=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');
   if(!state.changed||!tip)return r;
   p.audit({method_id:name,hook:'system-prompt/assemble',text:tip});
   return {...r,sections:[...r.sections,{name,order:28,text:tip,interpolate:false}]};
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
   const script=transform(args.script,{...state,task});
   if(script===args.script)continue;
   state.changed++;changes.set(c.index,JSON.stringify({...args,script}));
   state.audit({method_id:name,hook:'llm/stream',annotation:tip,before:args.script,after:script});
  }
  const sent=new Set();
  for(const c of chunks){const args=changes.get(c.index);
   if(args&&c.type==='tool-call-delta'){yield {...c,argumentsDelta:sent.has(c.index)?'':args};sent.add(c.index);}
   else if(args&&c.type==='block-end')yield {...c,block:{...c.block,arguments:args}};
   else yield c;
  }
 })());
}
