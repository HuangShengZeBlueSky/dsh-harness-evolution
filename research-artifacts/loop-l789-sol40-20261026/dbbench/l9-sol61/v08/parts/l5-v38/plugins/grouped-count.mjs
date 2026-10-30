export const name='grouped-count';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
function recordRows(input){
 const text=input.trim();if(text==='[]')return [];if(text[0]!=='['||text.at(-1)!==']')return null;
 const rows=[];let quote=null,depth=0,start=0,commas=0,last='';
 for(let i=1;i<text.length-1;i++){
  const c=text[i];if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}
  if(c==="'"||c==='"'){if(!depth)return null;quote=c;last=c;continue;}
  if(c==='('){if(depth===0){start=i;commas=0;last='';}depth++;continue;}
  if(c===')'){if(depth<1)return null;depth--;if(depth===0){if(commas+(last===','?0:1)<2)return null;rows.push(text.slice(start,i+1));}continue;}
  if(depth===0){if(!/[\s,]/.test(c))return null;continue;}
  if(depth===1){if(c===',')commas++;if(!/\s/.test(c))last=c;}
 }
 return depth===0&&!quote&&rows.length?rows:null;
}
const bag=a=>JSON.stringify(a.map(String).sort());
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();if(p.taskContext.type.some(t=>/^(INSERT|UPDATE|DELETE|REPLACE)$/i.test(t)))return;let latest=null,used=false;
 p.ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;latest=null;
  const query=args(call).query,raw=p.getRawBusinessResult(call.callId);
  if(!/^\s*SELECT\b/i.test(query)||!(/\bCOUNT\s*\(/i.test(query))||!(/\bGROUP\s+BY\b/i.test(query))||/\b(?:GROUP_CONCAT|SUM|AVG|MIN|MAX)\s*\(|\bUNION\b/i.test(query)||!raw||raw.error)return d;
  const groups=query.match(/\bGROUP\s+BY\b([\s\S]*?)(?=\bHAVING\b|\bORDER\s+BY\b|\bLIMIT\b|;|$)/i)?.[1];if(!groups||groups.includes(','))return d;
  const rows=recordRows(raw.content);if(rows!==null&&rows.length<=80&&raw.content.length<=12000)latest={query,rows};return d;
 });
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||!latest||call.name!=='commit_final_answer'||p.getVisibleInput().step>=14)return d;
  const answers=args(call).answers;if(!Array.isArray(answers)||bag(answers)===bag(latest.rows))return d;used=true;
  const reason='This actual GROUP BY COUNT result is structured data. Keep each original group label and its numeric count together as returned; do not change it into prose such as labels plus episodes. Preserve all returned rows. An empty grouped result is an empty answers array, not an empty-string answer. Ready commit_final_answer arguments: '+JSON.stringify({answers:latest.rows})+'. Actual query: '+latest.query+'. If more SQL is required by the task, execute it first. This notice has not submitted an answer.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
