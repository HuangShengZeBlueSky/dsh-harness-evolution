export const name='insert-representation';
function rowsOf(raw){
 const rows=[];let quote='',escape=false,depth=0,start=-1;
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
  if(c==='"'||c==="'"){quote=c;continue;}
  if(c==='('){if(depth===0)start=i;depth++;}
  else if(c===')'){depth--;if(depth===0&&start>=0)rows.push(raw.slice(start,i+1));}
 }
 return rows;
}
function cellOf(row){
 const s=row.slice(1,-1).trim().replace(/,\s*$/,'');
 if(!/^['"]/.test(s))return s==='None'?null:s;
 let out='';
 for(let i=1;i<s.length-1;i++){
  if(s[i]!=='\\'){out+=s[i];continue;}
  const c=s[++i];const n=c==='x'?2:c==='u'?4:c==='U'?8:0;
  if(n){out+=String.fromCodePoint(parseInt(s.slice(i+1,i+1+n),16));i+=n;}
  else out+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',a:'\x07','\\':'\\',"'":"'",'"':'"'})[c]??'\\'+c;
 }
 return out;
}

function valuesOf(row){
 const inner=row.slice(1,-1);let quote='',escape=false,depth=0,start=0,parts=[];
 for(let i=0;i<inner.length;i++){
  const c=inner[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
  if(c==='"'||c==="'"){quote=c;continue;}if(c==='(')depth++;else if(c===')')depth--;
  else if(c===','&&depth===0){parts.push(inner.slice(start,i));start=i+1;}
 }
 if(inner.slice(start).trim())parts.push(inner.slice(start));return parts.map(x=>cellOf('('+x+',)'));
}
const fold=s=>String(s??'').replace(/\s+/g,' ').trim().toLowerCase();

export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();const goal=String(taskContext?.description??''),info=String(taskContext?.add_description??'');
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
  if(!types.includes('INSERT')||!/\b(?:format|style|patterns?|conventions?)\b/i.test(goal))return;
  const headers=(info.split('headers of this table are ')[1]??'').replace(/\.$/,'').split(',').map(x=>x.trim());
  const styles=new Set();let reminded=false;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const raw=String(getRawBusinessResult(call.callId)?.content??'').trim();
   if(!/^\s*SELECT\s+\*/i.test(String(a?.query??''))||!raw.startsWith('[('))return d;
   for(const row of rowsOf(raw)){
    const values=valuesOf(row);if(values.length!==headers.length)continue;
    values.forEach((value,i)=>{if(/\S , \S/.test(String(value)))styles.add(fold(headers[i]));});
   }
   return d;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||reminded||!styles.size)return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??'');
   const m=sql.match(/^\s*INSERT\s+INTO\s+(?:`[^`]+`|[^\s(]+)\s*\(([\s\S]*?)\)\s*VALUES\s*([\s\S]*)/i);if(!m)return d;
   const columns=m[1].split(',').map(x=>x.trim().replace(/^`|`$/g,''));const corrections=[];
   for(const row of rowsOf('['+m[2]+']')){
    const values=valuesOf(row);if(values.length!==columns.length)continue;
    values.forEach((value,i)=>{
     if(!styles.has(fold(columns[i]))||typeof value!=='string'||!value.includes(','))return;
     value=value.replaceAll("''", "'");if(goal.includes('"'+value+'"')||goal.includes("'"+value+"'"))return;
     const normalized=value.replace(/\s*,\s*/g,' , ');if(normalized!==value)corrections.push({column:columns[i],attempted:value,observed_format:normalized});
    });
   }
   if(!corrections.length)return d;reminded=true;
   const reason='Observed insertion-format check: the task asks to follow existing formats, and the actual sampled cells in these columns use spaces on both sides of commas. Apply only that observed representation to the otherwise unchanged new values: '+JSON.stringify(corrections)+'. Do not copy any unrelated sample names, locations or facts. Preserve explicitly quoted new values and every requested field. This INSERT has not executed; reissue it with these representation corrections.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
