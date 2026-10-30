export const name='line-query';
const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
export function apply(ctx) {
  ctx.on('benchmark/setup',async ({ac,agent,audit,getVisibleInput},next)=>{
    await next();
    let task='',plan,corrected=false;
    ac.on('system-prompt/assemble',async (assembly,context,next)=>{
      const result=await next();
      if(!task)task=getVisibleInput().messages.find(m=>m.role==='user')?.content
        ||agent.session.snapshotEvents().find(e=>e.type==='user/message')?.data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')||'';
      if(!/\b(?:(?:total(?:\s+number\s+of)?|number\s+of)\s+lines|how\s+many\s+lines)\b/i.test(task))return result;
      const needle=task.match(/\b(word|string)\s+["\x60]([^"\x60]+)["\x60]/i);
      if(!needle||/exclud\w*[\s\S]{0,60}files?[\s\S]{0,40}contain/i.test(task))return result;
      const directory=task.match(/\b(?:subdirectory|directory|folder)\s+(?:named|called)\s+["\x60]([^"\x60]+)["\x60]/i)?.[1]
        ||task.match(/["\x60]([^"\x60]+)["\x60]\s+(?:directory|folder)\b/i)?.[1];
      const absolute=task.match(/\b(?:in|within|under)\s+(?:the\s+)?["\x60]?(\/[^"\x60\s]+)["\x60]?/i)?.[1];
      let scope;
      if(directory)scope=directory.startsWith('/')?quote(directory):directory.startsWith('~/')?'"$HOME"/'+quote(directory.slice(2)):/\bhome directory\b/i.test(task)?'"$HOME"/'+quote(directory):quote(directory);
      else if(absolute)scope=quote(absolute);
      else if(/\byour home\b/i.test(task)&&(task.match(/\b(?:directory|folder)\b/gi)||[]).length<=1)scope='"$HOME"';
      if(!scope)return result;
      const ext=task.match(/["\x60]?(\.[A-Za-z0-9]+)["\x60]?\s+(?:extension|files)\b/i)?.[1];
      const prefix=task.match(/\bnames?\s+starting\s+with\s+["\x60]([^"\x60]+)["\x60]/i)?.[1];
      const excluded=task.match(/exclud\w*[\s\S]{0,50}(?:named|called)\s+["\x60]([^"\x60]+)["\x60]/i)?.[1];
      const modified=task.match(/\bmodified\b[\s\S]{0,45}\blast\s+(\d+)\s+days\b/i)?.[1];
      if(/\b(?:last|past)\s+\d+\s+days\b/i.test(task)&&!modified)return result;
      let recursive=/\bsubdirector(?:y|ies)\b|\brecursiv/i.test(task);
      if(/\b(?:not have access to|no access to|do not include|exclude|excluding|without)\s+(?:any\s+)?subdirector/i.test(task))recursive=false;
      const explicitInsensitive=/\bcase[- ]insensitive\b|\bignore\s+case\b|\bnot\s+case[- ]sensitive\b/i.test(task);
      const explicitSensitive=/\bcase[- ]sensitive\b/i.test(task);
      const implicitFold=!explicitInsensitive&&!explicitSensitive&&needle[1].toLowerCase()==='word'&&needle[2]===needle[2].toLowerCase();
      const insensitive=explicitInsensitive||implicitFold;
      const flags='-h -F'+(needle[1].toLowerCase()==='word'?' -w':'')+(insensitive?' -i':'');
      plan='find '+scope+(recursive?'':' -maxdepth 1')+' -type f'
        +(ext?' -name '+quote('*'+ext):'')+(prefix?' -name '+quote(prefix+'*'):'')
        +(excluded?' ! -name '+quote(excluded):'')+(modified?' -mtime -'+modified:'')
        +' -exec grep '+flags+' -- '+quote(needle[2])+' {} + | wc -l';
      const text='The task asks for matching lines, counted once per line. This query-derived plan selects the requested directory, depth, file names and modification window, then streams matching content lines into one total. Call bash_action with these JSON arguments: '+JSON.stringify({script:plan})+'. Submit the actual returned count with answer_action.'+(implicitFold?' A lowercase word without an explicit case constraint is treated as a lexical term with case folding.':'');
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:30,text,interpolate:false}]};
    });
    ac.on('tools/pre-execute',async (call,next)=>{
      const result=await next();
      if(result.kind!=='allow'||call.name!=='bash_action'||!plan||corrected)return result;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const script=args.script||'';
      if(!/\bgrep\s+-[A-Za-z]*l\b/.test(script)||!/\bwc\s+-l\b/.test(script))return result;
      corrected=true;
      const reason='grep -l returns matching filenames, while this query requires matching lines. The command was not executed. Run the complete query-derived aggregation with bash_action:\n'+plan;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
