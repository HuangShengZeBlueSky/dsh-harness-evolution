export const name = 'unique-values';
export function apply(ctx) {
 const states = new Map();
 ctx.on('benchmark/setup', async (p,next) => {
  await next();
  const state={active:false,audit:p.audit};
  states.set(String(p.agent.session.id),state);
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   const task=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');
   state.active=/\b(unique|distinct)\b/i.test(task);
   if(!state.active)return r;
   const text='Unique-value aggregation: deduplicate extracted values across all input files; source filename prefixes are not part of a value.';
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:26,text,interpolate:false}]};
  });
 });
 ctx.on('llm/stream',(options,next)=>(async function*(){
  const state=states.get(String(options.sessionId));
  if(!state){yield* next();return;}
  const task=options.messages.filter(m=>m.role==='user').flatMap(m=>m.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');
  if(!/\b(unique|distinct)\b/i.test(task)){yield* next();return;}
  const chunks=[]; for await(const c of next())chunks.push(c);
  const replacements=new Map();
  for(const c of chunks){
   if(c.type!=='block-end'||c.block?.type!=='tool-call'||c.block.name!=='bash_action')continue;
   let args;try{args=typeof c.block.arguments==='string'?JSON.parse(c.block.arguments):c.block.arguments;}catch{continue;}
   if(typeof args?.script!=='string')continue;
   const script=args.script.replace(/\bgrep\s+([^|;\n]*)/g,(whole,tail)=>{
    if(/(?:^|\s)(?:-[a-zA-Z]*h\b|--no-filename\b)/.test(tail))return whole;
    return 'grep -h '+tail;
   });
   if(script===args.script)continue;
   replacements.set(c.index,JSON.stringify({...args,script}));
   state.audit({method_id:name,hook:'llm/stream',annotation:'Suppress source filenames for unique-value extraction',before:args.script,after:script});
  }
  const sent=new Set();
  for(const c of chunks){
   const args=replacements.get(c.index);
   if(args&&c.type==='tool-call-delta'){
    yield {...c,argumentsDelta:sent.has(c.index)?'':args};sent.add(c.index);
   }else if(args&&c.type==='block-end')yield {...c,block:{...c.block,arguments:args}};
   else yield c;
  }
 })());
}
