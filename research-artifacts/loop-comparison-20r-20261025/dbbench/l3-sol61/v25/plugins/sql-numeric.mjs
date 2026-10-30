export const name='sql-numeric';
const atom='`[^`]+`|[A-Za-z_][\\w.]*';
const numeric=id=>/^(Rank|Year|Season|Points|Total|Attendance)(\b|_)/i.test(id.replace(/^`|`$/g,''));
const cast=id=>"CAST(REPLACE("+id+", ',', '') AS DECIMAL(30,8))";
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit}=p;const denied=new Set();
  const tags=[p.taskContext?.type].flat().map(String);
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!tags.some(t=>/aggregation|ranking|comparison/i.test(t)))return r;
   const text='Numeric execution policy: for numeric measures stored as TEXT, compare and aggregate numeric values, removing thousands commas before CAST. MIN/MAX/ORDER BY text can give lexicographic results. For uncertain fields inspect actual stored values before assuming a date format. Use conversions to select the correct row, while returning the original requested lookup field.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:46,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql')return d;
   const q=call.arguments.query;if(denied.has(q))return d;
   let fixed=q.replace(new RegExp('\\b(MIN|MAX|SUM|AVG)\\s*\\(\\s*('+atom+')\\s*\\)','gi'),(all,fn,id)=>numeric(id)?fn+'('+cast(id)+')':all);
   fixed=fixed.replace(new RegExp('(\\bORDER\\s+BY\\s+)('+atom+')(?=\\s+(?:ASC|DESC|LIMIT)\\b|\\s*,|\\s*;?\\s*$)','gi'),(all,prefix,id)=>numeric(id)?prefix+cast(id):all);
   if(fixed===q)return d;denied.add(q);
   const reason='Numeric TEXT ordering/aggregation repair. Execute this corrected query before answering: '+fixed;
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
