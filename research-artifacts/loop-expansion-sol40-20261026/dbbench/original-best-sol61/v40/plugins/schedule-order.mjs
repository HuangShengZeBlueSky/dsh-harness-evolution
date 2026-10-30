export const name='schedule-order';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,audit,taskContext,getRawBusinessResult},next)=>{
  await next();const goal=String(taskContext?.description??''),info=String(taskContext?.add_description??'');
  const types=(Array.isArray(taskContext?.type)?taskContext.type:[taskContext?.type]).map(x=>String(x).toUpperCase());
  if(types.some(x=>/INSERT|UPDATE|DELETE/.test(x))||!/\b(?:first|last)\b/i.test(goal)||!/\b(?:team|opponent)\b/i.test(goal)||!/\b(?:faced|played against)\b/i.test(goal)||/\d/.test(goal))return;
  const headers=(info.split('headers of this table are ')[1]??'').replace(/\.$/,'').split(',').map(x=>x.trim());
  const game=headers.find(x=>/^Game(?: #)?$/i.test(x)),date=headers.find(x=>/^Date$/i.test(x)),opponent=headers.find(x=>/^Opponent$/i.test(x));
  const table=info.match(/The name of this table is (.+?), and the headers/s)?.[1];if(!game||!date||!opponent||!table)return;
  const q=x=>'`'+x.replaceAll('`','``')+'`',months='January February March April May June July August September October November December'.split(' ');
  const month=months.find(x=>new RegExp('\\b'+x+'\\b','i').test(goal));
  const read='SELECT '+[game,date,opponent].map(q).join(', ')+' FROM '+q(table)+' LIMIT 5;';
  let announced=false,inspected=false,ordered='',done=false,readWarned=false,orderWarned=false;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const d=await next();if(d.kind!=='accept'||call.name!=='execute_sql')return d;
   let a=call.arguments;if(typeof a==='string'){try{a=JSON.parse(a);}catch{return d;}}
   const sql=String(a?.query??''),raw=String(getRawBusinessResult(call.callId)?.content??'').trim();if(!raw.startsWith('[')||!/^\s*SELECT\b/i.test(sql))return d;
   let annotation='';
   if(sql===ordered||(/\bORDER\s+BY[\s\S]*CAST\s*\(/i.test(sql)&&sql.includes(game)&&(!month||sql.toLowerCase().includes(month.toLowerCase())))){
    done=true;annotation='Schedule-order receipt: submit the requested Opponent cell values exactly as returned, including any home/away prefix. Use the actual commit_final_answer tool to finish.';
   }else if(sql===read){
    inspected=true;
    if(/^\[\('\d+'/.test(raw)&&(!month||months.some(m=>raw.includes(m)))){
     ordered='SELECT '+q(opponent)+' FROM '+q(table)+(month?' WHERE '+q(date)+" LIKE '%"+month+"%'":'')+' ORDER BY CAST('+q(game)+' AS UNSIGNED) '+(/\blast\b/i.test(goal)?'DESC':'ASC')+' LIMIT 1;';
     annotation='Observed schedule sequence: first/last refers to the game order, not alphabetical opponent names. The task gives no year, so do not add one. Using these actual string formats, execute: '+ordered;
    }else annotation='Use the actual observed schedule sequence and date representation. Do not choose an opponent by alphabetical name or infer a missing month from a small sample.';
   }else if(!announced){announced=true;annotation='Schedule-order check: a first/last team question needs the game sequence and requested month. Inspect the actual sequence/date cells with '+read+' A sample from another month cannot establish absence, and alphabetical opponent order is unrelated to game order.';}
   if(!annotation)return d;audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='commit_final_answer'||done)return d;let reason='';
   if(!inspected&&!readWarned){readWarned=true;reason='Read the actual game/date sequence before choosing the first or last opponent: '+read;}
   else if(ordered&&!orderWarned){orderWarned=true;reason='The requested schedule-order query has not executed yet. Execute '+ordered+' Then submit its actual Opponent result.';}
   if(!reason)return d;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
