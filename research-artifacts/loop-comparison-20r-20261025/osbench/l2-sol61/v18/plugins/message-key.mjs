export const name='message-key';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent}=p;let corrected=false;
 const active=()=>/unique error messages|distinct error messages/i.test(agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n'));
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();if(!active())return r;
  const text='The error-message uniqueness key is the entire message body, excluding filename and timestamp. First apply any requested date/time filter, then locate the first ERROR marker, remove that marker and its adjacent colon/whitespace, and keep all remaining text before sort -u. Do not require whitespace immediately after ERROR: a colon may follow it. In basic/extended grep, [^\\n] does not mean the rest of the line. A field extraction pattern with awk is: p=index(toupper($0),"ERROR"); if(p){m=substr($0,p+5); sub(/^[[:space:]:-]+/,"",m); print m}. Preserve case-sensitive requirements when explicitly requested.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:35,text,interpolate:false}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||!active()||corrected)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const s=a.script;
  if(/sort|uniq/.test(s)&&((s.includes('[^\\n]')&&!/grep\s+-\S*P/.test(s))||s.includes('ERROR\\s+'))){
   corrected=true;const reason='This extraction can omit colon-delimited messages or truncate at the letter n. Extract the full text after the first ERROR marker, trim its leading colon/whitespace, then deduplicate the complete message body; retain the requested date filter.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  }return d;
 });
});}
