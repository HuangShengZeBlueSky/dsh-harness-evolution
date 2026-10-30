export const name='schema-contract';
const canonical=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64);
const quote=s=>'`'+canonical(s).replace(/`/g,'``')+'`';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const t=p.taskContext.table;
 const text='Exact public SQL schema: table '+quote(t.table_name)+'; columns '+t.table_info.columns.map(c=>quote(c.name)).join(', ')+'. Use these exact identifiers with MySQL backticks, including Rank and numeric/punctuation headers. Preserve non-breaking spaces inside names. Do not replace spaces with underscores. Map every requested fact to an existing column by meaning; a year first elected belongs in the corresponding elected column. DESCRIBE this exact table if unsure; do not silently omit required fields.';
 p.ac.on('system-prompt/assemble',async(a,c,n)=>{const r=await n();p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}]};});
});}
