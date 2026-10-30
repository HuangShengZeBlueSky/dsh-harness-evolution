export const name='public-schema-contract';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const info=String(taskContext?.add_description??''),table=info.match(/The name of this table is (.+?), and the headers/s)?.[1],columns=info.match(/headers of this table are (.*)\.$/s)?.[1]?.split(',');if(!table||!columns)return;
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();const text='Public identifier contract: table '+JSON.stringify(table)+', header display segments '+JSON.stringify(columns)+'. Use exact backticked identifiers, including non-ASCII whitespace. A comma inside a header can make these display segments ambiguous. A blank header or displayed line break is a reason to call DESCRIBE `'+table.replaceAll('`','``')+'`; before constructing the operation. Copy actual schema names rather than inventing underscores or treating Artist(s) as a function call. Preserve SQL string values independently of identifier quoting.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:23,text,interpolate:false}]};
 });
});}
