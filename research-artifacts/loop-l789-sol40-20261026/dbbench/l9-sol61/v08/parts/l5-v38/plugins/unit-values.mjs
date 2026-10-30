export const name='unit-values';
const canon=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64).toLowerCase();
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(!p.taskContext.type.some(t=>/^UPDATE$/i.test(t))||/exact(?:ly)?\s+(?:the\s+)?(?:string|text)|literal|verbatim|without.*(?:unit|quote)|remove.*(?:unit|quote)/i.test(p.taskContext.description))return;
 const info=p.taskContext.table.table_info,bindings=new Map();let used=false;
 for(let i=0;i<info.columns.length;i++){
  const byNumber=new Map();for(const value of new Set(info.rows.map(r=>String(r[i]??'')))){
   const m=value.match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:"|″|in(?:ch(?:es)?)?)\s*$/i);if(!m)continue;const key=String(Number(m[1]));if(!byNumber.has(key))byNumber.set(key,new Set());byNumber.get(key).add(value);
  }if(byNumber.size)bindings.set(canon(info.columns[i].name),byNumber);
 }
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||used||p.getVisibleInput().step>=14)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,q=a.query,m=q.match(/^\s*UPDATE\s+(?:`(?:``|[^`])+`|[^\s]+)\s+SET\s+([\s\S]*?)(?=\bWHERE\b|;?\s*$)/i);if(!m)return d;
  const notes=[],patched=m[1].replace(/(`(?:``|[^`])+`|[A-Za-z_]\w*)\s*=\s*'((?:''|\\.|[^'\\])*)'/g,(whole,column,raw)=>{
   if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))return whole;const values=bindings.get(canon(column.replace(/^`|`$/g,'')))?.get(String(Number(raw)));if(!values||values.size!==1)return whole;const value=[...values][0];notes.push(column+': '+JSON.stringify(raw)+' → '+JSON.stringify(value));return column+" = '"+value.replace(/'/g,"''")+"'";
  });if(!notes.length)return d;used=true;const start=m[0].length-m[1].length,fixed=q.slice(0,start)+patched+q.slice(m[0].length);
  const reason='This destination field already has one canonical original string for the same physical size: '+notes.join('; ')+'. A bare number omits the stored unit. Bind the quantity to its existing exact unit-bearing value, unless the task explicitly requires a literal string or removal of units. Ready execute_sql arguments: '+JSON.stringify({query:fixed})+'. This suggestion has not executed SQL; inspect the actual result and commit after the update.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
