export const name='result-bridge';
function rowsOf(raw){
 const s=String(raw).trim();if(s[0]!=='['||s.at(-1)!==']')return [];
 const rows=[];let quote='',escape=false,depth=0,start=-1;
 for(let i=1;i<s.length-1;i++){
  const c=s[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}
  if(c==="'"||c==='"'){quote=c;continue;}
  if(c==='('){if(depth++===0)start=i;}else if(c===')'&&--depth===0&&start>=0)rows.push(s.slice(start,i+1));
 }return rows;
}
function cellsOf(row){
 const cells=[];let start=1,quote='',escape=false;
 for(let i=1;i<row.length-1;i++){
  const c=row[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';}
  else if(c==="'"||c==='"')quote=c;
  else if(c===','){const v=row.slice(start,i).trim();if(v)cells.push(v);start=i+1;}
 }const v=row.slice(start,-1).trim();if(v)cells.push(v);return cells;
}
function decode(v){if(v[0]!=="'"&&v[0]!=='"')return v;return v.slice(1,-1).replace(/\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})/g,(_,x,u)=>String.fromCharCode(parseInt(x||u,16))).replace(/\\([\\'"nrt])/g,(_,c)=>({n:'\n',r:'\r',t:'\t'}[c]??c));}
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let latest='',answers=[],hadSql=false,committed=false,guardUsed=false;
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept')return d;
   if(call.name==='commit_final_answer')committed=true;
   if(call.name!=='execute_sql')return d;
   hadSql=true;if(config.selectOnly&&p.taskContext?.type?.[0]!=='SELECT')return d;const raw=p.getRawBusinessResult(call.callId)?.content||'';
   let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}
   if(!/^SELECT\b/i.test(args?.query?.trim()||''))return d;
   latest=raw;const rows=rowsOf(raw);answers=rows.map(row=>{const cells=cellsOf(row);return cells.length===1?decode(cells[0]):row;});
   if(!config.annotate||!rows.length)return d;
   const annotation='If this SELECT directly answers the user question, preserve every selected column and every matching row. Exact result-shaped commit arguments: '+JSON.stringify({answers}).slice(0,6500)+'. A diagnostic SELECT may still require the requested write or final query.';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();const missing=(p.getVisibleInput()?.messages||[]).some(m=>m.role==='user'&&/No executable tool calls|malformed or truncated/.test(m.content||''));const recovery=missing?' The previous response did NOT execute a tool. Correct the response format now: choose one provided function through the tool calling API, with its schema arguments; do not print a function name, JSON call, SQL block, or promise in plain content. The actual commit remains unexecuted until the commit tool receipt appears. ':'';const text='Completion contract: Give a brief explanation, then make the actual API tool call. Avoid repeating SQL in a code block or restating the whole plan. Every response must use a real provided function tool call. Writing commit_final_answer(...) in prose or a code block does not call it. For final SELECT answers use the exact returned values, without explanations or labels. For multiple selected columns each answer item must preserve the whole row as a tuple string, not just its first column. For writes, successful execution of the requested database change is required before final submission; final answer text can be brief. '+(config.live&&answers.length?'Latest SELECT result-shaped answers (use only if the query answers the question): '+JSON.stringify(answers).slice(0,6500):'')+` SQL executed: ${hadSql}; commit tool actually executed: ${committed}.`+recovery;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:50,text,interpolate:false}],tools:r.tools.map(x=>x.name==='commit_final_answer'?{...x,description:'Submit the actual final answer with a real function call using {"answers":["value"]}. '+text}:x)};
  });
  if(config.guard)p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||hadSql||guardUsed)return d;
   guardUsed=true;const reason='No SQL has executed yet. Inspect the real table with execute_sql before concluding information is unavailable; headers alone are not enough. Then query or perform the requested operation and submit.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
