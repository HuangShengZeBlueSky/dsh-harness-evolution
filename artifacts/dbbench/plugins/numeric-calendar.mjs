export const name='numeric-calendar';
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();if(config.selectOnly&&!String(p.taskContext?.type?.[0]||'').startsWith('SELECT'))return;if(config.relevantOnly&&!/least|fewest|most|highest|lowest|first|last|earliest|latest|maximum|minimum|larger|smaller|more than|less than|before|after|average|total|sum|rank|date|year/i.test(p.taskContext?.description||''))return;const info=p.taskContext?.table?.table_info||{};const profiles=(info.columns||[]).map((c,i)=>({field:c.name,values:[...new Set((info.rows||[]).map(r=>String(r[i]??'')))].filter(v=>/^[\d.,%+−–: -]+$/.test(v)).slice(0,4)})).filter(x=>x.values.length);const text='Numeric and chronological SQL: Database cells may be TEXT even when headers or metadata describe numbers/dates. For numeric MIN/MAX, sorting, thresholds, next rank, arithmetic use CAST(`field` AS DECIMAL(20,6)) or CAST(`field` AS UNSIGNED); text MAX would put 9 above 10. Preserve the original string when returning values. For a write, setting a field to 2 means assign 2 exactly; increasing by 2 means add 2 to its old numeric value. Do not turn a replacement into an increment. Never sort natural language dates alphabetically: inspect format then STR_TO_DATE, or use an explicit sequence/year column. For last episode use numeric episode/series order when present. First place means Rank 1, not Lane 1; heat/team identifiers must not be invented from lanes. '+(config.profile?' Observed public numeric/time-shaped strings by exact field: '+JSON.stringify(profiles).slice(0,3000):'')+(config.ties?'For extreme-value questions distinguish asking the numeric minimum from asking the person with that minimum. If asking names include all tied extrema unless exactly one is requested. ':'')+(config.formats?'MySQL date examples: STR_TO_DATE(`Date`,\'%M %e, %Y\'), STR_TO_DATE(`Date`,\'%d %M %Y\'), STR_TO_DATE(`Date`,\'%Y-%m-%d\'). Choose only a format matching actual data; date and duration strings are different. For formatted numbers remove commas before CAST, and inspect units rather than guessing. ':'');
  if(config.guard){
   const blocked=new Set();const numeric=(info.columns||[]).filter((col,i)=>{const values=(info.rows||[]).map(r=>String(r[i]??'').trim()).filter(Boolean);return values.length&&values.filter(v=>/^[+-]?\d[\d,]*(?:\.\d+)?%?$/.test(v)).length/values.length>=0.8;});
   p.ac.on('tools/pre-execute',async(call,next)=>{
    const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql')return d;let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}const q=args?.query||'';
    for(const col of numeric){
     if(blocked.has(col.name))continue;const escaped=col.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const token='(?:`'+escaped+'`|\\b'+escaped+'\\b)';
     if(new RegExp('\\b(?:MIN|MAX)\\(\\s*'+token+'\\s*\\)','i').test(q)||new RegExp('\\bORDER\\s+BY\\s+'+token+'(?:\\s+(?:ASC|DESC))?(?:\\s+LIMIT|\\s*;?\\s*$|\\s*,)','i').test(q)){
      blocked.add(col.name);const reason='Column '+col.name+' stores numeric-looking TEXT. Plain MIN/MAX/ORDER BY compares strings, so 9 can outrank 10. Retry with CAST(`'+col.name+'` AS DECIMAL(20,6)) in the aggregate/order expression (remove grouping commas if present), preserving the requested output values and all predicates.';p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
     }
    }return d;
   });
  }
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:35,text,interpolate:false}]};});
 });
}
