export const name='sql-identifiers';
const decode=s=>s.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|n|r|t|\\|'|")/gi,(_,v)=>/^[xu]/i.test(v)?String.fromCharCode(parseInt(v.slice(1),16)):({n:'\n',r:'\r',t:'\t','\\':'\\',"'":"'",'"':'"'}[v]));
const canonical=s=>s.replace(/\\+[nrt]/g,' ').replace(/\\+(?:x[aA]0|u00[aA]0)/g,' ').replace(/\s+/gu,' ').trim().toLowerCase();
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getVisibleInput,getRawBusinessResult}=p;
  let table='',initial=[],verified=[],requested=false;const denied=new Set();
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   for(const m of getVisibleInput().messages||[]){if(typeof m.content==='string'){
    const found=m.content.match(/The name of this table is ([\s\S]+?), and the headers of this table are ([\s\S]+?)\.\s*\nQuestion:/);
    if(found){table=found[1];initial=found[2].split(',');}
   }}
   let text='Identifier fidelity: headers can contain non-breaking spaces or display escapes. After an unknown-column error, DESCRIBE the actual task table and use the returned exact field names; do not repeat a printed backslash escape as an identifier.';
   if(verified.length)text+=' Verified DESCRIBE column names, authoritative over formatting in the initial description: '+verified.map(s=>'`'+s.replaceAll('`','``')+'`').join(', ')+'.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:44,text,interpolate:false}]};
  });
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql'||!/^\s*(DESCRIBE|DESC|SHOW\s+COLUMNS)\b/i.test(call.arguments.query))return d;
   const raw=getRawBusinessResult(call.callId);if(!raw||raw.error||result.isError||!call.arguments.query.toLowerCase().includes(table.toLowerCase()))return d;
   const fields=[...raw.content.matchAll(/\('((?:\\.|[^'])*)',\s*'text',/g)].map(m=>decode(m[1]));
   if(fields.length){verified=fields;const annotation='\n\nExact field names from this DESCRIBE (literal Unicode): '+JSON.stringify(fields)+'. Use these actual names rather than the presentation escapes in the task description.';audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};}
   return d;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||!table)return d;
   const q=call.arguments.query;if(/^\s*(DESCRIBE|DESC|SHOW\s+COLUMNS)\b/i.test(q))return d;
   let reason;
   if(!verified.length&&!requested&&/`[^`]*\\+(?:[nrt]|x[0-9a-f]{2}|u[0-9a-f]{4})[^`]*`/i.test(q)){
    requested=true;reason='The SQL uses escaped display characters in identifiers. First call execute_sql with DESCRIBE `'+table.replaceAll('`','``')+'`; then copy actual returned field names.';
   }else if(verified.length&&!denied.has(q)){
    const fixed=q.split(/('(?:''|\\.|[^'])*'|"(?:\\.|[^"])*")/g).map((part,i)=>i%2?part:part.replace(/`((?:``|[^`])+)`/g,(all,id)=>{
     const actual=verified.find(s=>canonical(s)===canonical(id.replaceAll('``','`')));return actual?'`'+actual.replaceAll('`','``')+'`':all;
    })).join('');
    if(fixed!==q){denied.add(q);reason='Use the verified database column spellings. Reissue execute_sql with query: '+fixed;}
   }
   if(!reason)return d;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
