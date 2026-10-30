export const name='search';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit}=p;
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='search_action')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  const clean=a.keywords.replace(/\b(?:and\s+)?price\b[\s\S]*$/i,'').replace(/\b(?:under|below|less than|lower than)\s*\$?\d+(?:\.\d+)?(?:\s*dollars?)?/gi,'').replace(/\$\s*\d+(?:\.\d+)?/g,'').replace(/[,;\s]+$/,'').trim();
  if(clean&&clean!==a.keywords){call.arguments={...a,keywords:clean};audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'rewrite',original:a.keywords,keywords:clean});}
  return d;
 });
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();const text='Search uses product terms. The search adapter removes price conditions while preserving product sizes, quantities and model numbers. Check the price limit against the product page.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};
 });
});}
