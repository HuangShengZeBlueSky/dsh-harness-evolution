export const name='write-number-style';
const canon=s=>s.replace(/\\[ntr]/g,' ').trim().slice(0,64);
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const info=p.taskContext.table.table_info,question=p.taskContext.description;let used=false;
 const styles=new Map(info.columns.flatMap((c,i)=>{
  const v=[...new Set(info.rows.map(r=>String(r[i]??'')).filter(Boolean))];if(v.length<2)return [];
  if(v.every(x=>/^[+-]?\d+$/.test(x)))return [[canon(c.name),{kind:'integer',examples:v.slice(0,3)}]];
  if(v.every(x=>/^[+-]?\d+\.\d+$/.test(x))){const digits=new Set(v.map(x=>x.split('.')[1].length));if(digits.size===1)return [[canon(c.name),{kind:'decimal',digits:[...digits][0],examples:v.slice(0,3)}]];}return [];
 }));
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||used||p.getVisibleInput().step>=14)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=a.query;
  const head=q.match(/^\s*INSERT\s+INTO\s+(?:`(?:``|[^`])+`|[^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*/i);if(!head)return d;
  const columns=head[1].split(',').map(c=>c.trim().replace(/^`|`$/g,'')),tail=q.slice(head[0].length);if(/\bSELECT\b|\bON\s+DUPLICATE\b/i.test(tail))return d;
  const fixes=[],notes=[];for(const row of tail.matchAll(/\(([^()]*)\)/g)){
   const tokens=[...row[1].matchAll(/'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|[^,]+/g)];if(tokens.length!==columns.length)return d;
   for(let i=0;i<tokens.length;i++){
    const token=tokens[i][0].trim(),quoted=(token[0]==="'"&&token.at(-1)==="'")||(token[0]==='"'&&token.at(-1)==='"'),raw=quoted?token.slice(1,-1).replace(/''/g,"'"):token,style=styles.get(columns[i]);if(!style||question.includes('"'+raw+'"')||question.includes("'"+raw+"'"))continue;
    let normalized=raw;if(style.kind==='integer'&&/^\$?[+-]?\d{1,3}(?:,\d{3})+(?:\.0+)?$/.test(raw))normalized=String(Number(raw.replace(/[$,]/g,'')));
    if(style.kind==='decimal'&&/^[+-]?0(?:\.0+)?$/.test(raw))normalized=(0).toFixed(style.digits);
    if(normalized===raw)continue;
    const offset=head[0].length+row.index+1+tokens[i].index+tokens[i][0].indexOf(token);fixes.push({start:offset,end:offset+token.length,value:"'"+normalized+"'"});notes.push(columns[i]+': '+JSON.stringify(raw)+' → '+JSON.stringify(normalized)+'; public examples '+JSON.stringify(style.examples));
   }
  }
  if(!fixes.length)return d;let fixed=q;for(const f of fixes.sort((a,b)=>b.start-a.start))fixed=fixed.slice(0,f.start)+f.value+fixed.slice(f.end);used=true;
  const reason='The public destination fields use a consistent numeric STRING style: '+notes.join('; ')+'. The task has not explicitly quoted these new literal forms as required exact strings. Match the existing storage style while preserving the requested quantity. Ready execute_sql arguments: '+JSON.stringify({query:fixed})+'. This suggestion has not executed or committed anything.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
