export const name='text-fidelity';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit},next)=>{
 await next();
 ac.on('system-prompt/assemble',async(assembly,context,next)=>{
  const result=await next();
  const text='Exact database text: copy the requested stored values literally into SQL string literals. Preserve spaces around commas and parentheses, punctuation, percent signs, thousands separators, Unicode dashes, and date formatting; do not prettify or paraphrase them. All table cells are text, including numbers. If the task asks to follow the existing style rather than giving an exact value, inspect representative existing rows first. Copy complete identifiers exactly too, including line breaks and unusual spacing, and enclose identifiers in backticks.';
  audit({method_id:name,hook:'system-prompt/assemble',text});
  return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
 });
});}
