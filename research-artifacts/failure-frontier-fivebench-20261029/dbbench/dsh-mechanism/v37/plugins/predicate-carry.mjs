export const name='predicate-carry';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=p;let memory=null,warned=false;
 const query=c=>(typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments).query;
 const table=q=>q.match(/\bFROM\s+(`[^`]+`|[A-Za-z_][\w]*)/i)?.[1]||'';
 const compact=s=>s.replace(/\s+/g,'').toLowerCase();
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
  const raw=getRawBusinessResult(call.callId),text=String(raw?.content||'').trim(),q=query(call);
  if(!raw||raw.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text))return d;
  if(/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(q)){memory=null;return d;}
  if(memory||!/^\s*SELECT\b/i.test(q)||text==='[]'||!text)return d;
  const where=q.match(/\bWHERE\s+([\s\S]*?)(?:\b(?:ORDER\s+BY|GROUP\s+BY|LIMIT)\b|;?$)/i)?.[1]||'';
  if(!/\bAND\b/i.test(where)||/\bOR\b/i.test(where))return d;
  const predicates=[...where.matchAll(/(?:`[^`]+`|[A-Za-z_][\w]*)\s*=\s*(?:'(?:''|[^'])*'|[+-]?\d+(?:\.\d+)?)/g)].map(m=>m[0]);
  if(predicates.length>=2&&table(q))memory={q,table:table(q),predicates};return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||!memory||warned)return d;
  const q=query(call);if(!/^\s*SELECT\b/i.test(q)||/\bDISTINCT\b|\b(?:COUNT|SUM|AVG|MAX|MIN)\s*\(/i.test(q)||table(q)!==memory.table)return d;
  if(memory.predicates.every(c=>compact(q).includes(compact(c))))return d;
  warned=true;const reason='Carry original lookup constraints: an earlier successful same-table query used '+memory.predicates.join(' AND ')+'. This new projection drops some of those conditions. An intermediate entity/name is not proven unique. Return the requested output column while retaining ALL original identifying conditions, or inspect full rows to prove uniqueness before replacing them. Earlier actual query: '+memory.q+'. Execute the corrected lookup; preserve returned value text.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
