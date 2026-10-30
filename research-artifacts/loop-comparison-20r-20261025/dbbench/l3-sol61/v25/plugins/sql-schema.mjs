export const name='sql-schema';
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,agent,audit,getVisibleInput}=p;let schema=null;const denied=new Set();const isWrite=[p.taskContext?.type].flat().some(t=>/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(String(t)));
  const quote=s=>'`'+s.replaceAll('`','``')+'`';
  const learn=()=>{
   if(schema)return;
   const visible=getVisibleInput().messages||[];
   const history=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>e.data);
   const initial=[...visible,...history].map(m=>typeof m.content==='string'?m.content:(m.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('')).join('\n');
   const m=initial.match(/The name of this table is ([\s\S]+?), and the headers of this table are ([\s\S]+?)\.\s*\nQuestion:/);
   if(m)schema={table:m[1],headers:m[2].split(',')};
  };
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();learn();
   const text='Use exact visible schema identifiers in MySQL; enclose table names, column names with spaces/punctuation and Rank in backticks. '+(schema?'Table '+quote(schema.table)+'; columns '+schema.headers.map(quote).join(', ')+'. ':'')+'Do not invent columns. The table may already describe one entity, so do not invent a player/person column to repeat context. Call execute_sql and commit_final_answer as actual functions.';
   audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,tools:r.tools.map(t=>t.name==='execute_sql'?{...t,description:t.description+' '+text}:t.name==='commit_final_answer'?{...t,description:t.description+(isWrite?' Finish completed changes using object arguments {"answers":["Done"]}.':' Submit exact requested query values from the SQL results; an operation acknowledgement is not a data answer.')}:t),sections:[...r.sections,{name,order:40,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||!schema)return d;
   const ids=[schema.table,...schema.headers.filter(s=>/\W/.test(s)||s.toLowerCase()==='rank')].sort((a,b)=>b.length-a.length);
   const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const pattern=new RegExp('(?<![\\p{L}\\p{N}_])('+ids.map(escape).join('|')+')(?![\\p{L}\\p{N}_])','giu');
   const q=call.arguments.query;
   const corrected=q.split(/('(?:''|\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:``|[^`])*`)/g).map((part,i)=>i%2?part:part.replace(pattern,quote)).join('');
   if(corrected===q||denied.has(q))return d;denied.add(q);
   const reason='Identifier quoting repair from the visible schema. Reissue execute_sql with query: '+corrected;
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
