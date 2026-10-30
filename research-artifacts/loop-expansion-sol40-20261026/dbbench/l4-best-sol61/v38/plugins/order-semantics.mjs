export const name='order-semantics';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const goal=String(taskContext?.description??'');
 if(!/\b(?:last|latest|earliest|first|oldest|newest)\b/i.test(goal))return;
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();const text='Ordering semantics: choose the ordering key from the question and schema. First/last episode normally refers to the numeric series or episode sequence when available. Calendar dates stored as text cannot be sorted chronologically by their raw month names. Inspect date formats, then parse with STR_TO_DATE using the observed format if chronological order is actually requested. Do not add unrelated lane, heat or season predicates: a table may already be scoped to the event described in the question.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:41,text,interpolate:false}]};
 });
});}
