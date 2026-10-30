export const name='field-evidence-control';
const decode=s=>s.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|n|r|t|'|"|\\)/gi,(_,c)=>c[0]==='x'||c[0]==='u'?String.fromCharCode(parseInt(c.slice(1),16)):({n:'\n',r:'\r',t:'\t'}[c]??c));
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
 await next();const goal=String(taskContext?.description??'');const roles=goal.match(/\bChange\s+(`?[^'"]+?`?)\s+to\s+['"]([^'"]+)['"]\s+to\s+have\s+(`?[^'"]+?`?)\s+as\s+['"]([^'"]+)['"]/i);const headers=String(taskContext?.add_description??'').match(/headers of this table are (.*)\.$/s)?.[1]?.split(',');if(!headers)return;let rows=[],reminded=false;
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(!/^\s*SELECT\s+\*/i.test(a?.query??''))return d;
  const raw=String(getRawBusinessResult(call.callId)?.content??'');
  const chunks=raw.match(/\((?:'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|[^()'"])*\)/g)??[];
  rows=chunks.map(chunk=>[...chunk.slice(1,-1).matchAll(/\s*(?:'((?:\\.|[^'])*)'|"((?:\\.|[^"])*)"|([^,]+))\s*(?:,|$)/g)].map(m=>decode(m[1]??m[2]??m[3]?.trim()??''))).filter(r=>r.length===headers.length);return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||reminded||!rows.length)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=String(a?.query??'');if(!/^\s*UPDATE\b/i.test(q))return d;
  if(roles){
   const locator=roles[1].replace(/`/g,'').trim(),target=roles[3].replace(/`/g,'').trim();
   const assignment=q.match(/\bSET\s+(`[^`]+`|\w+)\s*=/i)?.[1]?.replace(/^`|`$/g,'');
   if(assignment?.toLowerCase()===locator.toLowerCase()){
    reminded=true;const reason='Task field-role check: this description locates the entity by '+JSON.stringify(locator)+' = '+JSON.stringify(roles[2])+', and requests setting '+JSON.stringify(target)+' to '+JSON.stringify(roles[4])+'. Do not rename a different row merely because it already has the desired attribute. Inspect the named entity, then update the requested attribute using that entity locator. This UPDATE has not executed.';
    audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }
  }
  const where=q.split(/\bWHERE\b/i)[1]??'',m=where.match(/(`[^`]+`|\w+)\s*=\s*'((?:''|[^'])*)'/i);if(!m)return d;
  const col=m[1].replace(/^`|`$/g,''),value=m[2].replaceAll("''", "'").toLowerCase(),index=headers.indexOf(col);if(index<0||!value)return d;
  const dash=s=>s.toLowerCase().replace(/[–—−]/g,'-');
  const variants=[...new Set(rows.map(r=>r[index]).filter(s=>s.toLowerCase()!==value&&dash(s)===dash(value)))];
  if(variants.length===1){
   reminded=true;const reason='Observed value representation: the requested value matches a stored value in the SAME column after normalizing the dash character. The observed spelling is '+JSON.stringify(variants[0])+' in '+JSON.stringify(col)+'. Preserve the requested field and row meaning; use the actual stored representation if the task means this value. Do not move the predicate to another column just because a numeric fragment occurs there. This UPDATE has not executed.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  }
  if(rows.some(r=>r[index]?.toLowerCase().includes(value)))return d;
  const assigned=q.match(/\bSET\s+(`[^`]+`|\w+)\s*=/i)?.[1]?.replace(/^`|`$/g,'');
  if(assigned?.toLowerCase()!==col.toLowerCase()&&col.length>=3&&goal.toLowerCase().includes(col.toLowerCase())){
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'allow',reason:'The task explicitly names this predicate role; a sample match in another column cannot override the requested scope.'});return d;
  }
  const matches=headers.filter((h,j)=>j!==index&&rows.some(r=>r[j]?.toLowerCase().includes(value)));if(matches.length!==1)return d;reminded=true;
  const reason='Observed field mismatch: the sample contains the requested entity text in '+JSON.stringify(matches[0])+', while the attempted equality tests '+JSON.stringify(col)+'. Sample absence alone proves nothing, but this observed cross-column match is evidence to verify the entity field. Query the full matching rows in the observed field, then perform the task using the correct predicate column and requested target column. Do not treat the target column as the entity locator automatically. This UPDATE has not executed.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
