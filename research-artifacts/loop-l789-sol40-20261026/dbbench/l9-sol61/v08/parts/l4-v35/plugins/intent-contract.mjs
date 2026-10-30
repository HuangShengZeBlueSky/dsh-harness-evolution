export const name='intent-contract';
export function apply(ctx,config={}) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const q=p.taskContext?.description||'',kind=p.taskContext?.type?.[0]||'',table=p.taskContext?.table||{};
  const cols=(table.table_info?.columns||[]).map(c=>c.name),quote=s=>'`'+String(s).replaceAll('`','``')+'`';
  const m=q.match(/(?:change|update)\s+(.+?)\s+to\s+['"]([^'"]+)['"]\s+to\s+have\s+(.+?)\s+as\s+['"]([^'"]+)['"]/i);
  const field=s=>cols.find(c=>c.toLowerCase()===s.replaceAll('`','').trim().toLowerCase());
  const selector=m&&field(m[1]),target=m&&field(m[3]);
  const plan=selector&&target?{selector:{column:selector,value:m[2]},assignment:{column:target,value:m[4]}}:null;
  if(!plan)return;
  const broad='Task interpretation contract: '+JSON.stringify({requested_operation:kind,question:q})+'. Match the requested output entity and every filter before writing SQL. "How many" requires COUNT or the specified stored quantity; "what is the minimum/fewest" may ask for the value rather than a person. If asked to display multiple fields, SELECT and submit all of them. Do not add LIMIT 1 to a list/count question. Do not infer a table lacks data from headers alone: inspect rows. Parenthesize OR alternatives inside a shared AND filter. '+(config.precise?'For UPDATE distinguish the row selector from the field to change: update a named person\'s team means WHERE Name=the person and SET Team=the new team, not the inverse. Inspect the named record if wording is ambiguous. Every numeric phrase must attach to the correct named column: ordinal rank, lane, heat, season, series and episode number are different. If a requested heat is not a header, inspect the actual table before inventing an equivalent. If asked to add a revised historical record, INSERT the revised copy and retain the original row. ':'');
  const text=config.concise?'Requested operation: '+kind+'. '+(plan?'Parsed visible mutation relationship: '+JSON.stringify(plan)+'. Select the row by selector; assign the new value to assignment.column. Preserve all other predicates and fields.':'Use the original task to determine selectors, changed fields and requested outputs.'):broad;
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:20,text,interpolate:false}]};});
  if(config.directionGuard&&plan){
   let denied=false;const refers=(fragment,name)=>{const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp('(?:`'+escaped+'`|\\b'+escaped+'\\b)\\s*=','i').test(fragment);};
   p.ac.on('tools/pre-execute',async(call,next)=>{
    const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||denied)return d;let args=call.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{return d;}const sql=args?.query||'';
    const set=sql.match(/\bSET\b([\s\S]*?)(?:\bWHERE\b|$)/i)?.[1]||'',where=sql.match(/\bWHERE\b([\s\S]*)/i)?.[1]||'';
    if(/^\s*UPDATE\b/i.test(sql)&&refers(set,selector)&&refers(where,target)){
     denied=true;const val=s=>"'"+s.replaceAll("'","''")+"'";
     const reason='The mutation direction is reversed. The visible task identifies '+selector+'='+m[2]+' as the row selector and assigns '+target+'='+m[4]+'. Retry along this direction: UPDATE '+quote(table.table_name)+' SET '+quote(target)+'='+val(m[4])+' WHERE '+quote(selector)+'='+val(m[2])+'; preserve any additional task conditions.';
     p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
    }return d;
   });
  }
 });
}
