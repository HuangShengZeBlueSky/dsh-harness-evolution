export const name='sql-plan';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit}=p;
  const tags=[p.taskContext?.type].flat().filter(Boolean),plans=[];const isWrite=[p.taskContext?.type].flat().some(t=>/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(String(t)));
  for(const tag of tags){
   const agg=String(tag).match(/aggregation-(MIN|MAX|SUM|AVG)/i);
   if(agg)plans.push('Category '+tag+': use '+agg[1].toUpperCase()+' on the requested measure; cast numeric TEXT to a number. Do not aggregate a different field or substitute a row count for a sum.');
   else if(/counting/i.test(tag))plans.push('Count matching records or requested groups. Inspect actual row encodings and outcome labels before choosing the filter and COUNT.');
   else if(/ranking/i.test(tag))plans.push('Order the requested measure in the correct direction, numerically or chronologically as appropriate. Return the requested entity or original field, not the converted sorting key.');
   else if(/INSERT/i.test(tag))plans.push('Execute INSERT for every requested new row. For a next unused serial compute MAX(CAST(the quoted column AS SIGNED)), not MAX(text) or a manual guess. If copying a record, read it and retain unchanged fields.');
   else if(/UPDATE/i.test(tag))plans.push('Execute UPDATE on the requested existing rows with the exact fields, predicates and literal values, then submit.');
   else plans.push('Category '+tag+': identify the requested field and conditions using the visible schema and actual rows.');
  }
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   const common=isWrite?'Preserve exact requested literal strings and punctuation. Inspect a reference record when needed, preserve unchanged fields, execute all requested changes, then submit with the actual final-answer tool.':'Inspect actual rows before declaring a concept unavailable. For a lookup use CAST/STR_TO_DATE in comparisons or ordering but SELECT the original requested field and displayed format. Preserve returned row order unless requested otherwise. Do not combine separate returned values into a prose sentence.';
   const text='Public task plan: '+JSON.stringify(tags)+'\n'+plans.join('\n')+'\n'+common+' Public evidence: '+JSON.stringify(p.taskContext?.evidence??null);
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:42,text,interpolate:false}]};
  });
 });
}
