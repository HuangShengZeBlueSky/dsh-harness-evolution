export const name='typed-order';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit}=p;const info=p.taskContext?.table?.table_info;let redirected=false;
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||redirected||!info)return d;
   const q=call.arguments.query||'',m=q.match(/(\bORDER\s+BY\s+)(`([^`]+)`|([A-Za-z_]\w*))(\s+(?:ASC|DESC))?/i);if(!m)return d;
   const col=m[3]||m[4],index=info.columns.findIndex(c=>c.name.toLowerCase()===col.toLowerCase());if(index<0)return d;
   const values=info.rows.map(r=>String(r[index]??'')).filter(Boolean);if(values.length<2||!values.every(v=>/^\d{1,2} [A-Za-z]+ \d{4}$/.test(v)))return d;
   const expression="STR_TO_DATE("+m[2]+", '%e %M %Y')";
   const fixed=q.slice(0,m.index)+m[1]+expression+(m[5]||'')+q.slice(m.index+m[0].length);
   redirected=true;const reason='The public '+col+' cells use day-month-name-year text, for example '+JSON.stringify(values.slice(0,3))+'. Direct text ordering sorts by the first digit, not chronology. Use an explicit MySQL date conversion for this ordering. Candidate SQL with only ORDER BY converted:\n'+fixed;
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
