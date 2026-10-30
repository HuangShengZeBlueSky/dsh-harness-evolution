export const name='tool-description-contract';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());const writing=types.some(x=>['INSERT','UPDATE','DELETE'].includes(x));ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();const text='Native tool guide (tool-description-contract): choose this function through the API tool_calls field. A printed function invocation in assistant content does not execute.';
  const tools=r.tools.map(t=>({...t,description:t.description+'\n'+text+(t.name==='commit_final_answer'?' Tool arguments must be a JSON object with the required key answers, whose value is an array of actual result strings; a bare array or positional function call is not valid.'+(writing?' After successful completion of a modification, {"answers":[]} is sufficient.':' Use verified SQL result values as array items; this description supplies no answer values.'):' Supply a JSON object with the required key query, whose value is a single-line MySQL statement string. Keep exact backticked identifiers; double embedded SQL apostrophes in string values.')}));
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,tools};
 });
});}
