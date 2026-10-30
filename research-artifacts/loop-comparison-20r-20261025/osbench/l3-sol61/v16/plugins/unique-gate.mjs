export const name='unique-gate';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();let corrected=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||corrected)return d;
 const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const s=args?.script||'';
 if(/\bgrep\b/.test(s)&&/\bsort\s+(?:-[a-z]*u\b|[^|]*\|\s*uniq\b)/.test(s)&&/wc\s+-l/.test(s)&&! /\bgrep\s+(?:-[A-Za-z]*h|--no-filename)/.test(s)){
  corrected=true;const repair=s.replace(/\bgrep(?=\s)/g,'grep -h');const reason='Before counting unique values, suppress grep filename prefixes; otherwise equal values in different files count multiple times. Execute this corrected command with bash_action: '+repair;
  p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 }return d;
 });
});}
