import {sqlTokens} from './sql-insert.mjs';
export const name='qualified-values';
const canon=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64).toLowerCase();
const norm=s=>s.toLowerCase().replace(/\s+/g,' ');
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(p.taskContext.type.some(t=>/^(INSERT|UPDATE|DELETE|REPLACE)$/i.test(t)))return;
 const info=p.taskContext.table.table_info,question=norm(p.taskContext.description),profiles=[];
 info.columns.forEach((c,i)=>{const values=[...new Set(info.rows.map(r=>String(r[i]??'')))];for(const value of values){const m=value.match(/^(over|under|about|approximately|at least|more than|less than)\s+([0-9][0-9,]*(?:\.[0-9]+)?)$/i);if(m&&question.includes(norm(value)))profiles.push({field:c.name,value,number:Number(m[2].replaceAll(',',''))});}});
 if(!profiles.length)return;let used=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||call.name!=='execute_sql'||p.getVisibleInput().step>=14)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,sql=a.query||'';if(!/^\s*SELECT\b/i.test(sql))return d;
  const ts=sqlTokens(sql),wi=ts.findIndex(t=>t.text.toUpperCase()==='WHERE');if(wi<0)return d;
  for(let i=wi+1;i<ts.length-2;i++){
   const f=profiles.find(f=>canon(ts[i].text.replace(/^`|`$/g,''))===canon(f.field));if(!f||!/^>=?$|^<=?$|^=$/.test(ts[i+1].text))continue;
   const value=ts[i+2].text.replace(/^['"]|['"]$/g,'').replaceAll(',','');if(!/^[0-9]+(?:\.[0-9]+)?$/.test(value)||Number(value)!==f.number)continue;
   const predicate='`'+f.field.replace(/`/g,'``')+"` LIKE '%"+f.value.replace(/'/g,"''")+"%'",query=sql.slice(0,ts[i].start)+predicate+sql.slice(ts[i+2].end);used=true;
   const reason='The task repeats a qualified phrase that is itself an original text value in this field: '+JSON.stringify(f.value)+'. This mixed field is not a pure numeric measure; a bare greater-than or numeric CAST changes which records match that stated original phrase. Query the observed qualified text while preserving the requested result columns and every other condition. Ready execute_sql arguments: '+JSON.stringify({query})+'. This suggestion has not executed SQL or committed any answer.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  }return d;
 });
});}
