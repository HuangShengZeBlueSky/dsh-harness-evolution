export const name='budget-close';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getVisibleInput},next)=>{
 await next();ac.on('system-prompt/assemble',async(assembly,context,next)=>{
  const result=await next();const step=getVisibleInput().step;if(step<10)return result;
  const remaining=Math.max(0,15-step);
  const text='Call-budget state: this is model call '+step+' of 15; '+remaining+' calls remain after this response. Make executable progress now. If the necessary operations have already succeeded, submit with the actual commit_final_answer function using {"answers":["value"]}. If a real blocker remains, use one targeted corrected SQL call instead of another general investigation. Do not repeat an unchanged failed statement, re-announce a completed operation, or write <tool_call> XML/simulated calls in the content. Function arguments must be a JSON object. Base the answer on actual visible results; a failed SQL statement does not complete the task.';
  audit({method_id:name,hook:'system-prompt/assemble',text});
  return {...result,sections:[...result.sections,{name,order:27,text,interpolate:false}]};
 });
});}
