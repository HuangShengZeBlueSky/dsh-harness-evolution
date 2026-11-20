export const name='literal-contract';
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const info=p.taskContext?.table?.table_info||{}, rows=info.rows||[], cols=info.columns||[];
  const samples=cols.map((col,i)=>({column:col.name,examples:[...new Set(rows.map(r=>String(r[i]??'')))].slice(0,config.samples||3)}));
  const relevance=config.relevantRows ? rows.map(row=>({row,score:row.reduce((n,v)=>n+(String(v).length>2&&(p.taskContext?.description||'').toLowerCase().includes(String(v).toLowerCase())?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3).map(x=>x.row):[];
  const text='Exact value contract: Existing cells are strings. Preserve the user requested literal exactly, including case, spaces before commas, punctuation, Unicode en dash versus hyphen, decimal digits, percent signs, and time notation. Do not silently standardize a requested date to ISO or a nationality/medal to a different representation. For insert/update values described by meaning rather than a literal, inspect existing values in that column and follow their style. Unknown examples below are evidence of storage format, not extra requested changes. Column value examples: '+JSON.stringify(samples).slice(0,config.limit||5000)+(relevance.length?' Public task table rows overlapping the requested values: '+JSON.stringify(relevance).slice(0,3500):'')+(config.strict?' Before writing compare every requested field against the INSERT column/value pairing. Keep all supplied values and all unaffected fields.':'');
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};
  });
 });
}
