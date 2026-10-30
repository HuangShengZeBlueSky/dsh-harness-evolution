export const name='grep-check';
export function apply(ctx) {
  ctx.on('benchmark/setup',async ({ac,audit},next)=>{
    await next();
    let corrected=false;
    ac.on('tools/pre-execute',async (call,next)=>{
      const result=await next();
      if(result.kind!=='allow'||call.name!=='bash_action'||corrected)return result;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const script=args.script||'';
      const match=script.match(/\bgrep\s+([^|;\n]+)/);
      if(match && /\bsort\b/.test(script) && (/\buniq\b/.test(script)||/\bsort\s+-u\b/.test(script)) && !/(?:^|\s)-[A-Za-z]*h[A-Za-z]*(?:\s|$)|--no-filename/.test(match[1])) {
        corrected=true;
        const repaired=script.replace(/\bgrep\s+/,'grep -h ');
        const reason='Filename prefixes corrupt content deduplication. Run this corrected command next, preserving its pattern and file scope:\n'+repaired;
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      return result;
    });
  });
}
