export const name='numeric-comparisons';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
const canon=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64);
const quote=s=>'`'+canon(s).replace(/`/g,'``')+'`';
const tokens=sql=>[...sql.matchAll(/'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|>=|<=|<>|!=|[><=(),;]|[^\s><=(),;]+/g)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
const number=s=>{const v=s.replace(/^['"]|['"]$/g,'').replace(/[$,]/g,'').trim();return /^[+-]?\d+(?:\.\d+)?$/.test(v)?v:null;};
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const desc=p.taskContext.description,info=p.taskContext.table.table_info;
 if(p.taskContext.type.some(t=>/^(INSERT|UPDATE|DELETE|REPLACE)$/i.test(t))||/lexicograph|alphabetic|as a string|string (?:less|greater|comparison)/i.test(desc)||!/(?:over|under|more than|less than|above|below|at least|at most|greater|smaller|higher|lower|exceed)/i.test(desc))return;
 const fields=new Map(info.columns.flatMap((c,i)=>{const vs=info.rows.map(r=>String(r[i]??'').trim()).filter(v=>v&&!/^[-–—]$|^N\/?A$/i.test(v));return vs.length&&vs.some(v=>/\d,\d{3}/.test(v))&&vs.every(v=>number(v)!==null)?[[canon(c.name).toLowerCase(),c.name]]:[];}));if(!fields.size)return;let used=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||call.name!=='execute_sql'||p.getVisibleInput().step>=14)return d;
  const query=args(call).query;if(!/^\s*SELECT\b/i.test(query))return d;const ts=tokens(query),fixes=[];
  for(let i=0;i<ts.length-2;i++){
   const f=fields.get(ts[i].text.replace(/^`|`$/g,'').replace(/``/g,'`').toLowerCase()),op=ts[i+1].text,n=number(ts[i+2].text);if(!f||!['>','<','>=','<='].includes(op)||n===null)continue;
   const cleaned='REPLACE(REPLACE('+quote(f)+", ',', ''), '$', '')",value="("+cleaned+" REGEXP '^[+-]?[0-9]+([.][0-9]+)?$' AND CAST("+cleaned+' AS DECIMAL(30,10)) '+op+' '+n+')';fixes.push({start:ts[i].start,end:ts[i+2].end,value});
  }
  if(!fixes.length)return d;let corrected=query;for(const f of fixes.sort((a,b)=>b.start-a.start))corrected=corrected.slice(0,f.start)+f.value+corrected.slice(f.end);used=true;
  const reason='This is a numeric quantity comparison, while the public column stores thousands-separated strings. Direct SQL comparison can coerce a cell such as 33,000 to 33 or compare text lexically. Normalize the actual field and threshold numerically, exclude nonnumeric placeholders, and preserve the original result columns and all other filters. Ready execute_sql arguments: '+JSON.stringify({query:corrected})+'. Execute this real SELECT, inspect its actual result, and submit those data. This suggestion has not executed a query.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
