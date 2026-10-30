export const name='schema-identity';
export function apply(ctx){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();let table='',headers='',columns=[],displayWarned=false;
  const publicSchema=String(p.taskContext?.add_description||'').match(/The name of this table is (.*?), and the headers of this table are ([\s\S]*)/);
  if(publicSchema){table=publicSchema[1];headers=publicSchema[2].replace(/\.\s*$/,'');}
  const quoted=s=>'`'+s.replaceAll('`','``')+'`';
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();
   if(!table){const e=p.agent.session.snapshotEvents().find(e=>e.type==='user/message');const t=(e?.data?.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');const m=t.match(/The name of this table is (.*?), and the headers of this table are ([\s\S]*?)\.\nQuestion:/);if(m){table=m[1];headers=m[2];}}
   if(!table)return r;
   const text='Current MySQL schema identity: exact table '+quoted(table)+'. Do not replace spaces with underscores or omit words. Public headers: '+headers+'. '+(columns.length?'Confirmed by executed DESCRIBE; use these exact quoted identifiers: '+columns.map(quoted).join(', ')+'. ':'')+'Use backticks around table and column identifiers throughout SQL, including INSERT lists, WHERE and aggregates; `Rank` is a reserved identifier. Double quotes and single quotes are data strings in this MySQL mode, not column references: a WHERE with a double-quoted column may silently return no rows. If a header has unusual whitespace or is ambiguous, execute DESCRIBE on the exact quoted table and copy returned column names before retrying.';
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:20,text,interpolate:false}]};
  });
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   const raw=p.getRawBusinessResult(call.callId);if(!raw)return d;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   let text='';const content=String(raw.content);
   if(!raw.error&&/^\s*(DESCRIBE|DESC|SHOW\s+COLUMNS)\b/i.test(args.query||'')){
    const found=[...content.matchAll(/\('((?:\\.|[^'\\])*)', 'text'/g)].map(m=>m[1].replace(/\\x([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16))).replace(/\\n/g,'\n').replace(/\\'/g,"'").replace(/\\\\/g,'\\'));
    if(found.length){columns=found;text='Confirmed MySQL column identifiers (copy exactly, including whitespace): '+columns.map(quoted).join(', ')+'. Use these in the SQL tool arguments; string value quoting does not fix identifier errors.';}
   } else if(/^1064\s*\(/.test(content)&&/[A-Za-z]'[A-Za-z]/.test(args.query||''))text="SQL string-literal recovery: the actual query contains an apostrophe inside a word. Preserve the data value, but escape its internal apostrophe by doubling it inside a single-quoted SQL string. For example the data O'Brien becomes the SQL literal 'O''Brien'. This is SQL escaping, separate from JSON escaping. Identifier backticks cannot fix an unescaped apostrophe in a value; do not repeat the unchanged query.";
   else if(/^(1064|1054|1146)\s*\(/.test(content))text='Schema recovery: use exact table '+quoted(table)+' and backtick each column identifier (including `Rank`). Do not change only value quotes. For an unknown column, DESCRIBE '+quoted(table)+' and use the returned name, preserving spaces and punctuation. A syntax error is not evidence that INSERT or TEXT storage is unsupported.';
   if(!text)return d;p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,text});
   return {...d,content:[...(d.content||result.content),{type:'text',text}]};
  });
  p.ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||displayWarned||columns.length||call.name!=='execute_sql'||!headers.includes('\\n'))return d;
   const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   if(!/`[^`]*\\[^`]*`/.test(String(a?.query||'')))return d;displayWarned=true;
   const reason='Schema display recovery: this SQL uses a backslash inside a column identifier copied from a wrapped display header. The actual MySQL column name has not been confirmed. Execute DESCRIBE '+quoted(table)+' and copy the returned exact identifiers, then retry the business SQL. This reminder occurs once and no business SQL was executed.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });

 });
}
