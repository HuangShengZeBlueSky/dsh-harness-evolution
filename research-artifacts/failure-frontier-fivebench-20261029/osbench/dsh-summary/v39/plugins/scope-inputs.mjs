export const name = 'scope-inputs';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac,agent,audit,getRawBusinessResult}=payload;
    let files=[], used=false;
    ac.on('tools/post-execute', async(call,result,next)=>{
      const decision=await next();
      if(call.name!=='bash_action'||decision.kind!=='accept')return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const match=(args.script||'').match(/^\s*ls\s+(?:-[a-zA-Z0-9]+\s+)*([^\s;|]+)(?:\s+2>\/dev\/null)?\s*$/);
      if(!match)return decision;
      const raw=getRawBusinessResult(call.callId);
      files=[];
      if(!raw||raw.error||/No such file|cannot access/.test(raw.content||''))return decision;
      const base=match[1].includes('*')?match[1].slice(0,match[1].lastIndexOf('/')+1):match[1].replace(/\/$/,'')+'/';
      files=(raw.content||'').trim().split(/\s+/).filter(s=>/\.(log|txt)$/.test(s)).map(s=>base.startsWith('~/')?base+s.split('/').pop():s.includes('/')?s:base+s);
      return decision;
    });
    ac.on('tools/pre-execute', async(call,next)=>{
      const result=await next();
      if(result.kind!=='allow'||call.name!=='bash_action'||used||files.length<2)return result;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const script=args.script||'';
      const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').map(e=>e.data.content?.filter(b=>b.type==='text').map(b=>b.text).join('')||'').find(t=>t.includes('My problem is:'))||'';
      if(!(/across all|every log file|all the log files/i.test(task)||(/unique IP addresses/i.test(task)&&/multiple/i.test(task)))||/^\s*head\b/.test(script)||!/grep|cat/.test(script)||!(/uniq|wc\s+-l/.test(script)||(/most recent timestamp/i.test(task)&&/sort\s+-r\b/.test(script)&&/\bhead\b/.test(script)))||/\*/.test(script))return result;
      if(/each (?:log )?file/i.test(task)&&/sum (?:them|the)/i.test(task))return result;
      if(/most recent date|latest date/i.test(task)&&/naming pattern|file name|filename/i.test(task))return result;
      const present=files.filter(f=>script.includes(f));
      if(present.length!==1)return result;
      used=true;
      const suggestion=script.replace(present[0],()=>files.join(' ')).replace(/\bgrep\b/g,'grep -h');
      const reason='The successful directory listing showed multiple input files. Combine all listed files BEFORE the existing field extraction and global aggregation; keep the extraction filters intact. Retry bash_action: '+suggestion;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
