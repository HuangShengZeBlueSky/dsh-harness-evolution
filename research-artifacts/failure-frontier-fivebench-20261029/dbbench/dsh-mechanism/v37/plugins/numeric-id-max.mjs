export const name='numeric-id-max';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,agent,audit,getRawBusinessResult}=p;let noted=false;
  ac.on('tools/post-execute',async(call,result,next)=>{
    const decision=await next();
    if(decision.kind!=='accept'||call.name!=='execute_sql'||noted)return decision;
    const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,raw=getRawBusinessResult(call.callId);
    const match=a.query.match(/\bMAX\s*\(([^()]+)\)/i);
    if(!raw||raw.error||!/^\s*SELECT\b/i.test(a.query)||!match||!/^\[\('/.test(String(raw.content).trim()))return decision;
    const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n').split('Question:').slice(1).join('Question:');
    if(!/\b(?:next|unique|highest|rank)\b/i.test(task))return decision;
    noted=true;
    const annotation='Numeric identifier check: MAX on a TEXT column compares strings, so 9 can exceed 68 and a summary label can exceed all numbers. Do not assign the next rank/identifier from this lexical result or guess it. Inspect the stored values, ignore nonnumeric summary labels, and rerun using numeric conversion, e.g. MAX(CAST('+match[1]+' AS UNSIGNED)). Then choose the next unused number and insert it in the requested string format.';
    audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
    return {...decision,content:[...(decision.content||result.content),{type:'text',text:'\n'+annotation}]};
  });
});}
