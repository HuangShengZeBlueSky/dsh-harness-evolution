export const name='quantity-answer';
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
  await next();const goal=String(taskContext?.description??'');
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
  if(types.some(x=>/INSERT|UPDATE|DELETE/.test(x))||!/\b(?:fewest|least|lowest|minimum)\b/i.test(goal)||/\b(?:who|player|athlete|person|team|nation|country|college)\b|name\s+of/i.test(goal))return;
  let expected=null,pending='',warned=false;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??''),raw=String(getRawBusinessResult(call.callId)?.content??'').trim();if(!/^\s*SELECT\b/i.test(sql)||!raw.startsWith('[(')||raw.includes('[TRUNCATED]'))return d;
   expected=null;const projection=sql.match(/^\s*SELECT\s+([\s\S]*?)\s+FROM\b/i)?.[1]??'';
   const fields=projection.split(',').map(x=>x.trim().match(/^(`[^`]+`|[A-Za-z_]\w*)$/)?.[1]?.replace(/^`|`$/g,''));
   let annotation='';
   if(fields.every(Boolean)){
    const rows=rowsOf(raw).map(valuesOf),index=fields.findIndex(f=>/touchdown|goals?|points?|total|votes|score|number|position|rank|pick|attendance/i.test(f)&&fold(goal).includes(fold(f)));
    if(index>=0&&rows.every(row=>row.length===fields.length&&row[index]!==null)){expected=rows.map(row=>String(row[index]));pending='';annotation='Quantity-answer contract: this asks for the minimum quantity itself, not an accompanying person or row label. The actual requested cells support '+JSON.stringify({answers:expected})+'.';}
   }
   if(!annotation){
    const order=sql.match(/\bORDER\s+BY\s+(`[^`]+`|[A-Za-z_]\w*)/i)?.[1];
    if(order&&fold(goal).includes(fold(order.replaceAll('`','')))&&!projection.includes(order)){
     pending=sql.replace(/^\s*SELECT\s+[\s\S]*?\s+FROM\b/i,()=> 'SELECT '+order+' FROM');
     annotation='The question names the minimum quantity, but the query only projects its row label. Read the requested quantity with '+pending;
    }
   }
   if(!annotation)return d;audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||warned)return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   let reason='';
   if(pending)reason='Read the requested minimum quantity rather than submitting a person name: '+pending;
   else if(expected&&Array.isArray(a?.answers)){
    const got=a.answers.map(String).sort(),want=expected.map(String).sort();
    if(got.length!==want.length||got.some((x,i)=>x!==want[i]))reason='The requested answer is the quantity value. Preserve the actual result cells using '+JSON.stringify({answers:expected})+'.';
   }
   if(!reason)return d;warned=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
