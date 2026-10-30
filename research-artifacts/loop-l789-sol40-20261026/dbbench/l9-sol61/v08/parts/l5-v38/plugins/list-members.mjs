import {sqlTokens,commaParts} from './sql-insert.mjs';
export const name='list-members';
const args=c=>typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;
const canon=s=>String(s).replace(/\\[ntr]/g,' ').trim().slice(0,64).toLowerCase();
const field=t=>canon(t.replace(/^`|`$/g,'').replace(/``/g,'`'));
const decode=t=>/^['"]/.test(t)?t.slice(1,-1).replace(/''/g,"'").replace(/""/g,'"'):t;
const quote=s=>'`'+s.replace(/`/g,'``')+'`';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const desc=p.taskContext.description,info=p.taskContext.table.table_info;if(!p.taskContext.type.some(t=>/^UPDATE$/i.test(t)))return;
 const m=desc.match(/\b(?:include|add|append)\s+(["'])(.*?)\1\s+as\s+an?\s+additional\b/i);if(!m)return;const member=m[2];
 const named=[...desc.matchAll(/`([^`]+)`/g)].map(m=>canon(m[1])),candidates=info.columns.map((c,i)=>({name:c.name,index:i})).filter(c=>named.includes(canon(c.name))&&info.rows.some(r=>String(r[c.index]??'').includes(',')));if(candidates.length!==1)return;
 const f=candidates[0],styles=[...new Set(info.rows.flatMap(r=>String(r[f.index]??'').match(/,\s*/g)||[]))];if(styles.length!==1)return;const separator=styles[0];let used=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||used||call.name!=='execute_sql'||p.getVisibleInput().step>=14)return d;const query=args(call).query;if(!/^\s*UPDATE\b/i.test(query))return d;
  const ts=sqlTokens(query),si=ts.findIndex(t=>t.text.toUpperCase()==='SET'),wi=ts.findIndex(t=>t.text.toUpperCase()==='WHERE');if(si<0||wi<0||ts.slice(wi+1).some(t=>t.text.toUpperCase()==='OR'))return d;
  const conditions=[];for(let i=wi+1;i<ts.length-2;i++){const ci=info.columns.findIndex(c=>canon(c.name)===field(ts[i].text));if(ci<0||ts[i+1].text!=='='||!(/^(?:['"]|[+-]?\d+(?:\.\d+)?$)/.test(ts[i+2].text)))continue;conditions.push({index:ci,value:decode(ts[i+2].text).toLowerCase()});}
  if(!conditions.length)return d;const originals=info.rows.filter(r=>conditions.every(c=>String(r[c.index]??'').toLowerCase()===c.value)).map(r=>String(r[f.index]??''));if(!originals.length||originals.some(v=>!v.trim()||/^not applicable$|^N\/?A$|^[-–—]$/i.test(v.trim())))return d;
  const assignment=commaParts(ts.slice(si+1,wi)).find(part=>part[1]?.text==='='&&field(part[0].text)===canon(f.name));if(!assignment||assignment.length<3||assignment.slice(2).some(t=>field(t.text)===canon(f.name)))return d;
  const expression='CONCAT('+quote(f.name)+", '"+(separator+member).replace(/'/g,"''")+"')",corrected=query.slice(0,assignment[2].start)+expression+query.slice(assignment.at(-1).end);used=true;
  const reason='The task adds an additional member to an existing list. Public rows matching these actual equality filters already contain '+JSON.stringify([...new Set(originals)].slice(0,4))+'. A replacement or a guessed static old list loses members. Keep each actual row\'s original field and append using its existing separator. Ready execute_sql arguments: '+JSON.stringify({query:corrected})+'. All other assignments and filters are unchanged. Execute the real UPDATE and commit after success.';
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
