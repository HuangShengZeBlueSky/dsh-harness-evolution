export const name='regex-gate';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();let blocked=false;
 p.ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||blocked)return d;const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const s=args?.script||'';
 if(!/\bgrep\b/.test(s)||!/\s-[A-Za-z]*E\b|--extended-regexp/.test(s)||/\s-[A-Za-z]*P\b|--perl-regexp/.test(s)||! /\\+d/.test(s))return d;
 blocked=true;const repair=s.replace(/\\+d/g,'[0-9]').replace(/\\+\./g,'[.]');const reason='grep -E uses extended POSIX regex, where \\d is not a digit class. Use [0-9] for digits and [.] for a literal dot. Execute this portable corrected command with bash_action: '+repair;
 p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
