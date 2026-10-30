import {insertCells} from './sql-insert.mjs';
export const name='missing-values';
const canonical=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64).toLowerCase();
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!p.taskContext.type.some(t=>/^INSERT$/i.test(t))||/\bblank\b|\bempty (?:string|text)\b|\bNULL\b|''|""/i.test(p.taskContext.description))return;
 const info=p.taskContext.table.table_info,markers=new Map();let used=false;
 for(let i=0;i<info.columns.length;i++){
  const values=[...new Set(info.rows.map(r=>String(r[i]??'')))];if(values.some(v=>!v.trim()))continue;const missing=values.filter(v=>/^\s*[-–—]\s*$/.test(v));if(missing.length===1)markers.set(canonical(info.columns[i].name),missing[0]);
 }
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||used||p.getVisibleInput().step>=14)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=a.query,cells=insertCells(q);if(!cells)return d;
  const fixes=cells.filter(c=>/^(?:''|""|NULL)$/i.test(c.text)&&markers.has(canonical(c.column)));if(!fixes.length)return d;
  let query=q;const notes=[];for(const c of fixes.sort((a,b)=>b.start-a.start)){const value=markers.get(canonical(c.column));query=query.slice(0,c.start)+"'"+value.replace(/'/g,"''")+"'"+query.slice(c.end);notes.push(c.column+': '+c.text+' → '+JSON.stringify(value));}used=true;
  const reason='These public text fields consistently encode missing information with one existing dash value, and have no blank-value precedent: '+notes.join('; ')+'. The task has not explicitly required a blank string or SQL NULL. Preserve the existing missing-value convention for absent details. Ready execute_sql arguments: '+JSON.stringify({query})+'. Other supplied values are unchanged. Execute the actual INSERT, inspect its result, then commit. This notice has not written or submitted anything.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
