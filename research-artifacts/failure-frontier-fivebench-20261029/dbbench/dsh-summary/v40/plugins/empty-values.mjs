export const name='empty-values';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext},next)=>{
 await next();const description=String(taskContext?.description||'').toUpperCase();if(!description.includes('EMPTY')||description.includes('NULL'))return;
 let warned=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const decision=await next();if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(args?.query||'').trimStart(),upper=q.toUpperCase(),index=upper.indexOf('WHERE');
  if(!upper.startsWith('UPDATE')||index<0)return decision;const where=q.slice(index+5),quote=String.fromCharCode(39);
  if(!where.toUpperCase().includes('IS NULL')||where.includes(quote+quote))return decision;
  warned=true;const reason='The request says empty values, without restricting this to SQL NULL. IS NULL does not match an empty text string. Check the actual missing-value convention, or include both NULL and empty strings when the request means all empty entries. Keep the other requested conditions. This UPDATE did not execute; this reminder is issued only once.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
