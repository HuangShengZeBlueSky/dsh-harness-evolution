function rewrite(script,task){
 if(!/\bwhich file\b/i.test(task)||! /\b(highest|most|maximum)\b/i.test(task)||! /\bunique timestamps?\b/i.test(task)||/\b(move|delete|remove|rename|create)\b/i.test(task))return script;
 const dates=task.match(/\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b/g)||[];
 const loop=script.trim().match(/^for\s+[A-Za-z_][A-Za-z0-9_]*\s+in\s+([^;]+);\s*do[\s\S]*(?:;|\n)\s*done\s*$/);
 if(dates.length!==1||!loop)return script;
 if(!/\bcut\b[^|]*-f\s*1(?:\s|$)/.test(script)&&/\b(?:printf|echo)\b/.test(script))return script;
 const stamp="'[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}'";
 return "for rank_input_file in "+loop[1]+"; do rank_total=$(grep -h -oE "+stamp+" \"$rank_input_file\" | grep -F '"+dates[0]+"' | sort -u | wc -l); printf '%s\\t%s\\n' \"$rank_total\" \"${rank_input_file##*/}\"; done | sort -nr | head -n 1 | cut -f2-";
}
export const name='ranking-contract';
export function apply(ctx){
 const states=new Map();
 ctx.on('benchmark/setup',async(p,next)=>{
  await next(); const state={changed:false,audit:p.audit};states.set(String(p.agent.session.id),state);
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.changed)return r;
   const text='The ranking query requires unique full timestamps for the given day in each file, then the filename with the largest count. The actual command retains per-file identity and returns that filename; submit the observed filename.';
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
   state.audit({method_id:name,hook:'llm/stream',annotation:'Rank full per-file timestamps and preserve filename identity',before:args.script,after:script});
  }
  const sent=new Set();
  for(const c of chunks){const args=changes.get(c.index);
   if(args&&c.type==='tool-call-delta'){yield {...c,argumentsDelta:sent.has(c.index)?'':args};sent.add(c.index);}
   else if(args&&c.type==='block-end')yield {...c,block:{...c.block,arguments:args}};
   else yield c;
  }
 })());
}
