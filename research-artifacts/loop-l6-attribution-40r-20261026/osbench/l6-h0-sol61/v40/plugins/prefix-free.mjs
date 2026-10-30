export const name='prefix-free';
export function apply(ctx){ctx.on('benchmark/setup',async({ac,agent,audit},next)=>{
 await next();let reminded=false;
 ac.on('tools/pre-execute',async(call,next)=>{
  const result=await next();if(result.kind!=='allow'||call.name!=='bash_action'||reminded)return result;
  const task=agent.session.snapshotEvents().find(e=>e.type==='user/message')?.data.content.filter(b=>b.type==='text').map(b=>b.text).join('')||'';
  const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const s=args.script||'';
  const flags=s.match(/\bgrep\s+(-[A-Za-z]+(?:\s+-[A-Za-z]+)*)/);
  if(!/(unique|distinct)/i.test(task)||!(/(dates?|days?)/i.test(task)||(/IP address/i.test(task)&&/begin|start of the line/i.test(task)))||!flags||!flags[1].includes('o')||flags[1].includes('h')||!/(sort|uniq)/.test(s)||!(/xargs[^|]*grep/.test(s)||/grep[^|]*\*\.(?:log|txt)/.test(s)||(s.match(/[^\s]+\.(?:log|txt)/g)||[]).length>1))return result;
  reminded=true;const reason='Multi-file grep prefixes extracted values with filenames, which corrupts this global unique count. Add -h to the extracting grep: use grep -hoE PATTERN FILES (or xargs grep -hoE), then sort -u | wc -l. Keep the task filters and paths.';
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
