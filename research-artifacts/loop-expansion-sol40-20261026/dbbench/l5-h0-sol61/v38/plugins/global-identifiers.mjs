import {insertCells,sqlTokens} from './sql-insert.mjs';
export const name='global-identifiers';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
const canon=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64);
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const fieldName=t=>canon(t.replace(/^`|`$/g,'').replace(/``/g,'`')).toLowerCase();
const literal=t=>/^'(?:''|[^'])*'$/.test(t)?t.slice(1,-1).replace(/''/g,"'"):/^"[^"]*"$/.test(t)?t.slice(1,-1):/^\d+$/.test(t)?t:null;
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const info=p.taskContext.table.table_info,desc=p.taskContext.description;
 if(!p.taskContext.type.some(t=>/^INSERT$/i.test(t))||!/unique|next|not duplicate/i.test(desc)||/combination|composite|pair of/i.test(desc))return;
 const intent=desc.replace(/\([^)]*\be\.?g\.?[^)]*\)/gi,'');
 if(info.columns.some(c=>/^(season|series|group|heat)$/i.test(canon(c.name))&&new RegExp('\\b'+esc(canon(c.name))+'\\b','i').test(intent))&&!/globally|entire table|all existing/i.test(intent))return;
 const profiles=info.columns.flatMap((c,i)=>{
  const key=canon(c.name);if(!/^(rank|no\.?|number|id|episode(?:\s*(?:#|number))?|game(?:\s*(?:#|number))?|match(?:\s*(?:#|number))?)$/i.test(key))return [];
  const occurrence=new RegExp('(?<![A-Za-z])'+esc(key)+'(?![A-Za-z])','gi');let near='';for(const m of intent.matchAll(occurrence)){const text=intent.slice(Math.max(0,m.index-65),m.index+key.length+65);if(/unique|next|not duplicate/i.test(text))near+=text;}
  if(!near||new RegExp(esc(key)+'[s]?\\s*(?:as|is|of|=|:|to)?\\s*[\'"`]?\\d','i').test(intent))return [];
  const values=info.rows.map(r=>String(r[i]??'').trim()),parts=values.map(v=>v.match(/^(.*?)(\d+)$/)).filter(Boolean);if(parts.length<2||new Set(parts.map(m=>m[1])).size!==1)return [];
  const prefix=parts[0][1],nums=parts.map(m=>Number(m[2])),width=parts.every(m=>m[2].length===parts[0][2].length)&&parts.some(m=>/^0\d/.test(m[2]))?parts[0][2].length:0;
  return [{name:c.name,key:key.toLowerCase(),prefix,width,used:new Set(nums),max:Math.max(...nums),next:/next/i.test(near)}];
 });if(!profiles.length)return;let target=null,trusted=true,warnings=0;const blocked=new Set();
 function numeric(f,cell){const v=literal(cell.text);if(v===null||!v.startsWith(f.prefix))return null;const s=v.slice(f.prefix.length);return /^\d+$/.test(s)?Number(s):null;}
 function observe(sql){
  if(!/^\s*SELECT\b/i.test(sql)||/\bJOIN\b|\bUNION\b|\bGROUP\s+BY\b/i.test(sql))return;
  const body=sql.match(/\bMAX\s*\(([\s\S]*?)\)\s*(?:AS\s+(?:`[^`]+`|\w+))?\s+FROM\b/i)?.[1]||sql.match(/\bORDER\s+BY\s+([\s\S]*?)\s+DESC\b/i)?.[1];if(!body)return;
  const referenced=sqlTokens(body).map(t=>fieldName(t.text)),matches=profiles.filter(f=>referenced.includes(f.key));if(matches.length!==1)return;const f=matches[0];
  const where=sql.match(/\bWHERE\b([\s\S]*?)(?=\bORDER\s+BY\b|\bLIMIT\b|$)/i)?.[1]||'',refs=sqlTokens(where).filter(t=>!/^['"]/.test(t.text)).map(t=>fieldName(t.text));
  if(info.columns.some(c=>canon(c.name).toLowerCase()!==f.key&&refs.includes(canon(c.name).toLowerCase()))){blocked.add(f.key);if(target===f)target=null;return;}
  blocked.delete(f.key);target=f;
 }
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||!trusted)return d;const query=args(call).query;observe(query);const cells=insertCells(query);if(!cells||warnings>=2||p.getVisibleInput().step>=14)return d;
  if(!target){const matches=profiles.filter(f=>!blocked.has(f.key)&&cells.some(c=>canon(c.column).toLowerCase()===f.key));if(matches.length===1)target=matches[0];}if(!target||blocked.has(target.key))return d;
  const ids=cells.filter(c=>canon(c.column).toLowerCase()===target.key),numbers=ids.map(c=>numeric(target,c));if(!ids.length||numbers.some(n=>n===null))return d;
  if(!numbers.some(n=>target.used.has(n))&&new Set(numbers).size===numbers.length&&(!target.next||numbers.every((n,i)=>n===target.max+1+i)))return d;
  let corrected=query;const fixes=ids.map((c,i)=>({...c,value:target.prefix+String(target.max+1+i).padStart(target.width,'0')}));for(const c of fixes.sort((a,b)=>b.start-a.start))corrected=corrected.slice(0,c.start)+"'"+c.value.replace(/'/g,"''")+"'"+corrected.slice(c.end);warnings++;
  const reason='This task explicitly requires unused identifiers in '+JSON.stringify(target.name)+'. The public initial identifiers and successful recorded INSERTs establish numeric maximum '+target.max+' with prefix '+JSON.stringify(target.prefix)+'. The proposed identifiers collide, repeat within this INSERT, or violate the requested next value. Text MAX/order does not give the numeric maximum. Ready execute_sql arguments changing only these identifier literals: '+JSON.stringify({query:corrected})+'. Preserve the other supplied values, actually execute the INSERT, then commit after success. This notice has not written anything.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;const raw=p.getRawBusinessResult(call.callId);if(!raw||raw.error||/^\s*(?:\d{4}\s*\(|Error\b)/i.test(raw.content))return d;
  const query=args(call).query;if(/^\s*(UPDATE|DELETE|REPLACE)\b/i.test(query)){trusted=false;return d;}if(!/^\s*INSERT\b/i.test(query))return d;
  const cells=insertCells(query);if(!cells){trusted=false;return d;}for(const f of profiles){const ids=cells.filter(c=>canon(c.column).toLowerCase()===f.key),ns=ids.map(c=>numeric(f,c));if(!ids.length||ns.some(n=>n===null)){trusted=false;return d;}for(const n of ns){f.used.add(n);f.max=Math.max(f.max,n);}}return d;
 });
});}
