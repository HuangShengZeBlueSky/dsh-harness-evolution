export const name='rank-identifier';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!p.taskContext.table.table_info.columns.some(c=>c.name.toLowerCase()==='rank'))return;let used=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||used||p.getVisibleInput().step>=14)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=a.query;
  const fixed=q.replace(/('(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`)|\bRank\b(?!\s*\()/gi,(m,quoted)=>quoted?m:'`Rank`');if(fixed===q)return d;used=true;
  const reason='Rank is an actual public column and a MySQL reserved identifier. Quote its column references with backticks; keep literal strings and RANK() functions unchanged. Execute the corrected statement with these arguments: '+JSON.stringify({query:fixed})+'. This notice has not executed SQL; inspect the real result and commit after the required operation.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
