export const name='schema-spelling';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();
 ac.on('tools/post-execute',async(call,result,next)=>{
  const decision=await next();if(decision.kind!=='accept'||call.name!=='execute_sql')return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,raw=getRawBusinessResult(call.callId);
  if(!raw||raw.error||!/^\s*(DESCRIBE|DESC|SHOW\s+COLUMNS)\b/i.test(String(args?.query||'')))return decision;
  const names=[...String(raw.content).matchAll(/\('([^']*)',\s*'text'/g)].map(m=>m[1]);
  const slash=String.fromCharCode(92);
  if(!names.some(n=>n.includes(slash+'x')||n.includes(slash+'u')))return decision;
  const decoded=names.map(n=>n.replace(new RegExp(slash+slash+'+x([0-9a-f]{2})','gi'),(_,h)=>String.fromCodePoint(parseInt(h,16))).replace(new RegExp(slash+slash+'+u([0-9a-f]{4})','gi'),(_,h)=>String.fromCodePoint(parseInt(h,16))));
  const annotation='Observed schema spelling, with representation escapes decoded into actual characters: '+decoded.map(n=>'`'+n+'`').join(', ')+'. Copy the actual characters inside these backticks into SQL. A non-breaking space (U+00A0) is different from an ordinary space; do not type the literal backslash-x-a-0 spelling. Execute through the native function interface and use only actual query results for the answer.';
  audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
 });
});}
