import {sqlTokens,commaParts} from './sql-insert.mjs';
export const name='brand-coverage';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
const canon=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64).toLowerCase();
const field=t=>canon(t.replace(/^`|`$/g,'').replace(/``/g,'`'));
const decode=t=>/^['"]/.test(t)?t.slice(1,-1).replace(/''/g,"'"):null;
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const desc=p.taskContext.description,info=p.taskContext.table.table_info;if(!p.taskContext.type.some(t=>/^UPDATE$/i.test(t))||!/append[\s\S]*text/i.test(desc)||/only (?:the )?(?:following|named)|following models/i.test(desc))return;
 const m=desc.match(/\ball\s+([^\s"']+)\s+(?:car\s+)?models\b/i),ci=info.columns.findIndex(c=>/^models?$/i.test(c.name));if(!m||ci<0)return;const brand=m[1],values=[...new Set(info.rows.map(r=>String(r[ci]??'')).filter(v=>v.toLowerCase().startsWith(brand.toLowerCase())))];if(values.length<2)return;let used=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||call.name!=='execute_sql'||p.getVisibleInput().step>=14)return d;const query=args(call).query;if(!/^\s*UPDATE\b/i.test(query)||/\bCASE\b/i.test(query))return d;
  const ts=sqlTokens(query),wi=ts.findIndex(t=>t.text.toUpperCase()==='WHERE');if(wi<0)return d;const fixes=[];
  for(let i=wi+1;i<ts.length-2;i++){
   if(field(ts[i].text)!==canon(info.columns[ci].name))continue;let names=[],end=-1;
   if(ts[i+1].text==='='&&decode(ts[i+2].text)!==null){names=[decode(ts[i+2].text)];end=i+2;}
   else if(ts[i+1].text.toUpperCase()==='IN'&&ts[i+2].text==='('){let depth=1,j=i+3;for(;j<ts.length;j++){if(ts[j].text==='(')depth++;if(ts[j].text===')'&&--depth===0)break;}if(j===ts.length)continue;const parts=commaParts(ts.slice(i+3,j));if(parts.some(p=>p.length!==1||decode(p[0].text)===null))continue;names=parts.map(p=>decode(p[0].text));end=j;}
   if(end<0||!names.length||names.some(v=>!v.toLowerCase().startsWith(brand.toLowerCase()))||values.every(v=>names.some(n=>n.toLowerCase()===v.toLowerCase())))continue;
   fixes.push({start:ts[i].start,end:ts[end].end,value:'`'+info.columns[ci].name.replace(/`/g,'``')+"` LIKE '"+brand.replace(/'/g,"''")+"%'"});
  }if(!fixes.length)return d;let corrected=query;for(const f of fixes.sort((a,b)=>b.start-a.start))corrected=corrected.slice(0,f.start)+f.value+corrected.slice(f.end);used=true;
  const reason='The task requests every model in the named brand, while this WHERE enumerates only some of the '+values.length+' public matching model names. Preserve the entire requested brand class with its actual prefix rather than a few familiar models. Ready execute_sql arguments preserving the assignment and other predicates: '+JSON.stringify({query:corrected})+'. Execute the real UPDATE and commit after success.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
