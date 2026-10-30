export const name='path-memory';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();let listing='',task='';
 p.ac.on('system-prompt/assemble',async(a,c,next)=>{if(!task)task=p.getVisibleInput().messages.filter(m=>m.role==='user').map(m=>m.content||'').join('\n');return await next();});
 p.ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept'||call.name!=='bash_action')return d;const raw=p.getRawBusinessResult(call.callId);if(!raw)return d;const output=String(raw.content);const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;const script=args?.script||'';
 const bad=/no such file or directory|cannot access|not a directory/i.test(output);
 if(!bad&&!raw.error&&/\b(ls|find)\b/.test(script)&&! /OS is empty/.test(output))listing=output.replace(/^The output of the OS:\s*/,'').slice(0,400);
 if(!bad)return d;
 let annotation='This is a path error, not proof that the task data is absent. Reuse the directory prefix from successful listings; listing a directory does not change the working directory.';
 if(/home directory/i.test(task))annotation+=' The home directory is ~ or $HOME; a relative home/ path is merely a subdirectory. Check pwd and use the actual task directory.';
 if(listing)annotation+=' Earlier successful listing (already observed):\n'+listing;
 annotation+=' Repair the path with bash_action before concluding that the task is impossible.';
 p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});return {...d,content:[...(d.content||result.content),{type:'text',text:annotation}]};
 });
});}
