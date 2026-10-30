export const name='grep-dialect';
export function apply(ctx){
 const states=new Map();
 ctx.on('benchmark/setup',async(p,next)=>{
  await next(); const state={changed:false,audit:p.audit};states.set(String(p.agent.session.id),state);
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.changed)return r;
   const text='Grep uses POSIX digit classes: [0-9] matches a digit. Continue from the actual command receipt and submit its exact answer when complete.';
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
   const script=args.script.replace(/\bgrep\b[^|;\n]*/g,segment=>segment.replace(/\\d/g,'[0-9]'));
   if(script===args.script)continue;
   state.changed=true;changes.set(c.index,JSON.stringify({...args,script}));
   state.audit({method_id:name,hook:'llm/stream',annotation:'Normalize unsupported grep digit class',before:args.script,after:script});
  }
  const sent=new Set();
  for(const c of chunks){const args=changes.get(c.index);
   if(args&&c.type==='tool-call-delta'){yield {...c,argumentsDelta:sent.has(c.index)?'':args};sent.add(c.index);}
   else if(args&&c.type==='block-end')yield {...c,block:{...c.block,arguments:args}};
   else yield c;
  }
 })());
}
