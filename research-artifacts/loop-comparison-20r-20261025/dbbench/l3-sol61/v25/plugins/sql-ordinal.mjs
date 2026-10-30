export const name='sql-ordinal';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,getVisibleInput,getRawBusinessResult}=p;let ordinal=false,pending='',checked=false;
 ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();for(const m of getVisibleInput().messages||[])if(m.role==='user'&&typeof m.content==='string'&&m.content.includes('Question:'))ordinal=/\b\d+(?:st|nd|rd|th)\b/i.test(m.content.split('Question:').at(-1));return r;});
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql'||!ordinal)return d;
  const raw=getRawBusinessResult(call.callId),q=call.arguments.query;if(!raw||raw.error||result.isError)return d;
  if(pending&&/^\s*SELECT\s+DISTINCT\b/i.test(q)){pending='';checked=true;}
  const col=q.match(/\bWHERE\s+(`[^`]*(?:Position|Place|Rank)[^`]*`|Position|Place|Rank)\s*=\s*'?\d+'?/i),table=q.match(/\bFROM\s+(`[^`]+`|[A-Za-z_]\w*)/i);
  if(!checked&&col&&table&&/\bCOUNT\s*\(/i.test(q)&&/^\[\(0,?\)\]$/.test(raw.content.trim())){
   pending='Ordinal label check: the user asked for an ordinal, while the filter used a bare number and counted zero. Inspect actual stored spellings before accepting zero: SELECT DISTINCT '+col[1]+' FROM '+table[1]+'; then count the matching observed ordinal label.';
   const annotation='\n\n'+pending;audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  }return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||!pending||checked)return d;checked=true;const reason=pending;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};});
});}
