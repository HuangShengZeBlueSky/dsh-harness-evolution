export const name='regex-dialect';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit,agent}=p;let corrected=false;
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>JSON.stringify(e.data)).join(' ');
  if(!/timestamp|unique dates|unique days/i.test(task))return r;
  const text='For timestamp extraction with grep, use POSIX digits [0-9], not \\d. grep -E supports {4}; basic grep needs \\{4\\}. Inspect a short real input sample to see whether timestamps start with a bracket. Extract just YYYY-MM-DD for unique dates, but include the time for unique timestamps. A zero regex match does not establish that files contain no timestamps.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:27,text,interpolate:false}]};
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||corrected)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const s=a.script||'';
  if(/\bgrep\b/.test(s)&&s.includes('\\d')&&!/grep\s+-\S*P/.test(s)){
   corrected=true;const reason='grep basic/extended regex does not recognize \\d as digits. Replace \\d with [0-9], use grep -E with unescaped {n}, and preserve the observed bracket format.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  }return d;
 });
});}
