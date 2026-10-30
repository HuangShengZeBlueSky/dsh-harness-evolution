export const name='insertion-style';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
 await next();const goal=String(taskContext?.description??'');const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
 if(!types.includes('INSERT'))return;let reminded=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql'||reminded)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,raw=String(getRawBusinessResult(call.callId)?.content??'');
  if(!/^\s*SELECT\s+\*/i.test(a?.query??'')||!raw.startsWith('[('))return d;reminded=true;
  const annotation='New-record style audit: map every provided fact to its column using these observed rows. Preserve meaningful prefixes and suffixes: tied place may be T5; an election date may include elected; a rank may end in a period; a score cell may contain round-by-round scores plus =total. Nationality adjectives may need a country label matching the column. If observed titles have literal quote-and-space wrappers, reproduce that cell representation rather than confusing it with SQL quoting. Do not add separators between multiple names unless the stored field uses them. Keep explicit new names, numbers and dates from the task; samples supply only representation and necessary unchanged context.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
