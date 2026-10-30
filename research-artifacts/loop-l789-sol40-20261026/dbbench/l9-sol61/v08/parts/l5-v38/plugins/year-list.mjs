export const name='year-list';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!/\byears\b/i.test(p.taskContext.description)||p.taskContext.type.some(t=>/^(INSERT|UPDATE|DELETE|REPLACE)$/i.test(t)))return;
 let latest=null,used=false;
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;latest=null;const query=args(call).query,raw=p.getRawBusinessResult(call.callId);
  if(/^\s*SELECT\b/i.test(query)&&raw&&!raw.error&&raw.content.trim().startsWith('['))latest={query,raw:raw.content};return d;
 });
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||used||!latest||p.getVisibleInput().step>=14)return d;
  const a=args(call).answers;if(!Array.isArray(a)||a.length!==1||!/^\s*\d{4}(?:\s*,\s*\d{4})+\s*$/.test(a[0]))return d;
  if(latest.raw.includes("'"+a[0]+"'")||latest.raw.includes('"'+a[0]+'"'))return d;
  const years=a[0].split(',').map(y=>y.trim());if(!years.every(y=>latest.raw.includes("'"+y+"'")||latest.raw.includes('"'+y+'"')))return d;used=true;
  const reason='The question asks for multiple years, and each of these individual years occurs in the actual SELECT result. A single comma-separated answer string is one value, not a list of years. Submit each year separately using '+JSON.stringify({answers:years})+'. Preserve your chosen years and all question filters; if those years are not yet established, execute a more precise SELECT. Actual query: '+latest.query+'. This notice has not committed an answer.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
