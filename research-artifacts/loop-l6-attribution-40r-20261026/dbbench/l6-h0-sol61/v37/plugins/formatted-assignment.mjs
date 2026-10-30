export const name='formatted-assignment';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const tokens=String(p.taskContext?.description||'').match(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g)||[];if(!tokens.length)return;let used=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query||'');if(!/^\s*UPDATE\b/i.test(q))return d;
  const set=q.split(/\bSET\b/i)[1]?.split(/\bWHERE\b/i)[0]||'';
  const lost=tokens.filter(t=>!set.includes(t)&&new RegExp('(^|[^0-9])'+t.replaceAll(',','').replaceAll('.','\\.')+'([^0-9]|$)').test(set));if(!lost.length)return d;used=true;
  const reason='Formatted TEXT assignment check: this UPDATE has not executed. Your SET clause uses an unformatted number corresponding to an explicitly comma-formatted value in the question: '+lost.join(', ')+'. Preserve the requested separators and decimal places in the assigned TEXT value by quoting the complete formatted string. If a currency marker or existing storage convention is unclear, inspect actual original rows rather than normalizing the value. Numeric WHERE comparisons are separate. This reminder occurs once.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
