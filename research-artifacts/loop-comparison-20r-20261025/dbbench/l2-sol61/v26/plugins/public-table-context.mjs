export const name='public-table-context';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,taskContext,getRawBusinessResult}=p;let observed=false;
  const table=JSON.stringify(taskContext?.table??null);
  ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(call.name==='execute_sql'&&!/^\s*(SHOW|DESC|DESCRIBE)\b/i.test(call.arguments.query||'')){const raw=getRawBusinessResult(call.callId);if(raw&&!raw.error&&!/^\d{4} \(/.test(String(raw.content)))observed=true;}return d;});
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(observed||table==='null')return r;
   const text='Official public table context supplied with this task (initial data excerpt):\n'+table.slice(0,12000)+'\nUse the public schema and example cells to distinguish similarly named fields and match stored formats. The excerpt may be incomplete. Use execute_sql for actual operations and any additional evidence; this initial context does not imply that a requested mutation has executed.';
   audit({method_id:name,hook:'system-prompt/assemble',text,public_table_kind:Array.isArray(taskContext.table)?'array':typeof taskContext.table});return {...r,sections:[...r.sections,{name,order:24,text,interpolate:false}]};
  });
 });
}
