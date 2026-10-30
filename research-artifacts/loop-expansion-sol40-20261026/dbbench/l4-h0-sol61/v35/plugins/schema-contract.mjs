export const name='schema-contract';
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const t=p.taskContext?.table||{}, columns=(t.table_info?.columns||[]).map(x=>x.name);
  const quote=s=>'`'+String(s).replaceAll('`','``')+'`';
  let lastError='',observedSchema='';const blocked=new Set();
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   const detail=`SQL schema contract: This is MySQL. Exact table identifier: ${quote(t.table_name||'use user supplied table')}. Exact column identifiers: ${columns.map(quote).join(', ')}. Copy these names exactly; spaces, punctuation and embedded newlines are part of names. Never invent underscore replacements. Use backticks for all table/column identifiers, single quotes for data. Rank is a reserved word and MUST be quoted even inside MAX or CAST. ${config.concise?'': 'A natural-language phrase such as year first elected must map to an existing header, rather than a new field. If uncertain use DESCRIBE with the exact quoted table.'} ${config.errorMemory&&lastError?'Last schema error: '+lastError:''}`;
   const baseText=config.minimal?`MySQL exact schema: table ${quote(t.table_name)}, columns ${columns.map(quote).join(', ')}. Quote identifiers with backticks; preserve names and use only these columns. ${config.errorMemory&&lastError?'Actual schema error to repair: '+lastError:''}`:detail;
   const text=baseText+(config.observed&&observedSchema?' Environment-confirmed schema receipt (use actual names rather than guessed variants): '+observedSchema:'');
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:25,text,interpolate:false}],tools:r.tools.map(x=>x.name==='execute_sql'?{...x,description:x.description+' '+text}:x)};
  });
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(call.name!=='execute_sql'||d.kind!=='accept')return d;
   const raw=p.getRawBusinessResult(call.callId)?.content||'';
   if(/^(1054|1064|1146)\b/.test(raw))lastError=raw.slice(0,350);
   if(config.observed){let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}if(/^\s*(?:DESCRIBE|DESC|SHOW\s+(?:COLUMNS|FIELDS|TABLES))\b/i.test(args?.query||'')&&!/^\d{4} \(/.test(raw))observedSchema=(args.query+' => '+raw).slice(0,3500);}
   return d;
  });
  if(config.guard)p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql')return d;
   let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}
   const q=args?.query||'';
   const masked=q.replace(/'(?:''|\\.|[^'\\])*'/gs,"''").replace(/`(?:``|[^`])*`/gs,'``');
   const bad=columns.filter(x=>/^rank$|^group$|^order$/i.test(x)).find(x=>new RegExp('\\b'+x+'\\b','i').test(masked));
   if(bad&&!blocked.has(bad)){
    blocked.add(bad);const reason=`SQL identifier ${bad} is reserved. Retry the same intended SQL with ${quote(bad)} quoted everywhere, including aggregate and ordering expressions. Do not change the table or data values.`;
    p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
   }return d;
  });
 });
}
