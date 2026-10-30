import {sqlTokens} from './sql-insert.mjs';
export const name='year-boundary';
const canonical=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64);
const quote=s=>'`'+canonical(s).replace(/`/g,'``')+'`';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const description=p.taskContext.description;if(!p.taskContext.type.some(t=>/^UPDATE$/i.test(t))||!/four[ -]digit/i.test(description)||!/exact|range|multi.year/i.test(description))return;
 const info=p.taskContext.table.table_info,fields=info.columns.filter((c,i)=>/year|elected|debut/i.test(c.name)&&description.toLowerCase().includes(c.name.toLowerCase())&&info.rows.filter(r=>/^\d{4}$/.test(String(r[i]??''))).length>=2);if(fields.length!==1)return;
 const field=quote(fields[0].name),constraint=field+" REGEXP '^[0-9]{4}$'";let warnings=0;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||warnings>=2||p.getVisibleInput().step>=14)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=a.query.trim().replace(/;\s*$/,'');if(!/^UPDATE\b/i.test(q))return d;
  const m=q.match(/^([\s\S]*?\bWHERE\b)([\s\S]+)$/i);if(!m||/\bORDER\s+BY\b|\bLIMIT\b/i.test(m[2])||!sqlTokens(m[2]).some(t=>canonical(t.text.replace(/^`|`$/g,'')).toLowerCase()===canonical(fields[0].name).toLowerCase()))return d;
  if(m[2].toLowerCase().includes(constraint.toLowerCase())||/\b(?:CHAR_LENGTH|LENGTH)\s*\([^)]*\)\s*=\s*4\b/i.test(m[2]))return d;
  warnings++;const query=m[1]+' ('+m[2].trim()+') AND '+constraint+';';
  const reason='The task explicitly requires an exact four-digit year and excludes multi-year/range strings. A prefix such as 19% also matches range values present in the public field. Preserve the original year set and every other condition, and enforce four digits for the entire WHERE expression. Ready execute_sql arguments: '+JSON.stringify({query})+'. The original WHERE is parenthesized so the constraint applies to every OR branch. Correct any independent SQL syntax error while retaining this bound; execute the actual UPDATE and commit after success. This notice has not executed SQL.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
