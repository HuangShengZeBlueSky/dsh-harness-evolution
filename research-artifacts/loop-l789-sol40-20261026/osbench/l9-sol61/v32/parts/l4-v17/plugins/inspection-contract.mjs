export const name='inspection-contract';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit},next)=>{
  await next();
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   const text='OS execution workflow: First inspect the requested directory and a few actual input lines with bash_action. Determine the real path and record format before selecting fields or writing a regex. Then compute exactly the requested quantity: filter records, extract the requested value, aggregate, and submit the exact result with the actual answer_action tool. A shell error followed by 0 is not evidence of an empty dataset. Fix the command and recompute. Use $HOME for the home directory; quoted tilde does not expand. With grep -E use [0-9], not \\d. Use grep -h when processing multiple files so filename prefixes do not become data. Distinguish matching lines, matching files, and unique extracted values. Never create sample data to solve a read-only counting task.';
   audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};
  });
 });
}
