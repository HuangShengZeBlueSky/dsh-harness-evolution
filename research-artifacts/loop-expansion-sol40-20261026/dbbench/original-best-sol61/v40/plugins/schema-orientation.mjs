export const name='schema-orientation';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();const info=String(taskContext?.add_description??'');
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());if(types.some(x=>/INSERT|UPDATE|DELETE/.test(x)))return;
  const headers=(info.split('headers of this table are ')[1]??'').replace(/\.$/,'').split(',').map(x=>x.trim());
  const models=headers.slice(1).filter(h=>/^model\b/i.test(h)),table=info.match(/The name of this table is (.+?), and the headers/s)?.[1];if(models.length<3||!table)return;
  const first=headers[0],q=x=>'`'+x.replaceAll('`','``')+'`',read='SELECT DISTINCT '+q(first)+' FROM '+q(table)+';';let catalogueRead=false,reminded=false;
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();const text='Public schema orientation: rows are labelled by '+q(first)+', while the repeated model columns '+models.map(q).join(', ')+' describe separate models. A requested component/attribute may be stored in the row-label cells, rather than being a column header. Read the complete row-label catalogue with '+read+' Then query the relevant attribute row across the model columns. Counts or averages of model properties combine the relevant model cells; COUNT(*) would count attribute rows. Do not infer missing data from headers or a short sample.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:37,text,interpolate:false}]};
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??''),raw=String(getRawBusinessResult(call.callId)?.content??'').trim();if(!raw.startsWith('[(')||raw.includes('[TRUNCATED]')||/\bLIMIT\b/i.test(sql))return d;
   const projection=(sql.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM\b/i)?.[1]??'').replace(/^DISTINCT\s+/i,'').replaceAll('`','').trim().toLowerCase();
   if(projection!==first.toLowerCase()&&projection!=='*')return d;catalogueRead=true;
   const annotation='Actual attribute-row catalogue is now visible. Match the requested attribute to its stored row label, then inspect that row across the model columns. Derive the requested count/average from those actual cells, preserving their units and codes.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||catalogueRead||reminded)return d;reminded=true;
   const reason='This is a wide model-property table. The requested attribute may be an actual row label. Read '+read+' before declaring it absent or counting models; then inspect the relevant model cells and submit the grounded result.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
