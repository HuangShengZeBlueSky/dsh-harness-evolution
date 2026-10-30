export const name='result-fields';
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
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
  if(types.some(x=>/INSERT|UPDATE|DELETE/.test(x)))return;
  const goal=String(taskContext?.description??'');
  const multi=/\b(?:for each|both|each college|each team|display|provide a list)\b/i.test(goal);
  let expected=null,reminded=false;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??''),raw=String(getRawBusinessResult(call.callId)?.content??'').trim();
   if(!/^\s*SELECT\b/i.test(sql)||!raw.startsWith('['))return d;
   expected=null;if(raw.includes('[TRUNCATED]'))return d;
   const rows=rowsOf(raw);if(!rows.length)return d;
   const projection=sql.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM\b/i)?.[1]??'';
   let annotation='';
   if(multi&&projection.includes(',')&&!/^\s*\*/.test(projection)){
    expected=rows;annotation='Requested multi-column result: preserve every requested cell as one complete tuple string per row. Do not convert these tuples into unquoted comma-separated prose or keep only the first column.';
   }else if(/^\s*(?:DISTINCT\s+)?(?:`[^`]+`|[A-Za-z_]\w*)\s*$/i.test(projection)&&!/^\s*DISTINCT\b/i.test(projection)&&!/\b(?:unique|distinct|different)\b/i.test(goal)){
    const values=rows.map(cellOf);
    if(values.every(x=>x!==null)&&new Set(values).size<values.length){expected=values;annotation='Result multiplicity check: this query returned repeated values in separate matching rows. Preserve those duplicate result cells unless the question asks for distinct values. Do not silently deduplicate the answer.';}
   }
   if(!annotation)return d;
   annotation+=' Grounded submission payload for this result: '+JSON.stringify({answers:expected})+'. Use it when this query answers the original question; inspection rows are not a substitute for the requested query.';
   audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||!expected||reminded)return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   if(!Array.isArray(a?.answers))return d;
   const given=a.answers.map(String).sort(),want=expected.map(String).sort();
   if(given.length===want.length&&given.every((x,i)=>x===want[i]))return d;
   reminded=true;const reason='The submitted answer drops or reformats cells from the last requested result. Preserve complete rows and duplicate cells. The actual result supports this tool payload: '+JSON.stringify({answers:expected})+'. If that SQL was only an inspection, execute the actual requested query before submitting instead.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
