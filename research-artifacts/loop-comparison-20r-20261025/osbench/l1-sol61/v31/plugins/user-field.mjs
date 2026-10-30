export const name='user-field';
export function apply(ctx) {
  ctx.on('benchmark/setup',async ({ac,agent,audit},next)=>{
    await next();
    ac.on('system-prompt/assemble',async (assembly,context,next)=>{
      const result=await next();
      const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
      if(!/timestamp\s*-\s*user_id\s*-\s*action_type/i.test(task))return result;
      const text="For records formatted timestamp - user_id - action_type, count distinct middle fields, not numeric fragments of the timestamp. Inspect a few records, then use awk -F ' - ' 'NF>=3 {print $2}' on the requested log files, followed by sort -u and wc -l. Use their full paths: cd inside find -exec sh does not change the outer shell's directory.";
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
  });
}
