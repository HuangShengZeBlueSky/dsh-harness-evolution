export const name='tool-protocol';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getVisibleInput},next)=>{
 await next();
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const result=await next();const malformed=(getVisibleInput()?.messages||[]).some(m=>m.role==='user'&&String(m.content).includes('XML was malformed'));
  if(!malformed)return result;
  const text='Tool protocol recovery: the last XML text did not invoke any tool. Use the native function-calling interface, not XML, Markdown, or a printed function expression. execute_sql takes one object with a query string. commit_final_answer takes one object with an answers array of STRINGS. For a multi-column result, each complete returned row is one tuple STRING, not an array of columns; do not place multiple arrays beside each other in a JSON object. Keep the observed data and call the intended tool directly. A failed text representation does not mean earlier SQL failed.';
  const tools=result.tools.map(t=>t.name==='commit_final_answer'?{...t,description:t.description+' Native function arguments: one object with answers as an array of strings. Each multi-field row is one complete tuple string, not a nested array. Printing XML does not call this function.'}:t.name==='execute_sql'?{...t,description:t.description+' Invoke through native function calling with one object containing the query string; do not print XML.'}:t);
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...result,tools,sections:[...result.sections,{name,order:30,text,interpolate:false}]};
 });
});}
