export const name='protocol';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();p.ac.on('system-prompt/assemble',async(a,c,next)=>{
 const r=await next();const text='Use one real tool call each turn. Run bash_action to inspect or compute; submit the exact result with answer_action. Use finish_action for completed operations.';
 p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};
});});}
