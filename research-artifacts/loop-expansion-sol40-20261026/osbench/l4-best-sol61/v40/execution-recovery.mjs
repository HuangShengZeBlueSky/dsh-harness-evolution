export const name='execution-recovery';
export function apply(ctx) {
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const state={error:null,blocked:false};
  p.ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();
   if(decision.kind!=='accept'||call.name!=='bash_action')return decision;
   const raw=p.getRawBusinessResult(call.callId);
   const text=typeof raw?.content==='string'?raw.content:(result.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
   const detail=text.split('\n').find(line=>/^(?:find|grep|ls|cat|awk|sed|bash|sh|du|wc|sort|cut|xargs|head|tail|stat|python3?):.*(?:No such file|not found|cannot|syntax|invalid|error|must precede|missing|unrecognized)/i.test(line)||/^Traceback\b/.test(line));
   if(!detail&&!raw?.error&&!result.isError){state.error=null;state.blocked=false;return decision;}
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   state.error={script:args.script,detail:detail||text.slice(0,220)};
   const annotation='Execution recovery: this command failed: '+state.error.detail+'. A trailing zero after this error is not a computed task answer. Inspect the requested path or syntax and run the corrected computation before submitting.';
   p.audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
   return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.error)return r;
   const text='Unresolved actual command error: '+state.error.detail+'\nFailed script: '+state.error.script.slice(0,260)+'\nRecover using a corrected real bash_action. Do not submit the failed pipeline count.';
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};
  });
  p.ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();
   if(decision.kind!=='allow'||!state.error||state.blocked||!['answer_action','finish_action'].includes(call.name))return decision;
   state.blocked=true;
   const reason='The last real command failed: '+state.error.detail+'. Run bash_action to inspect the actual requested path and repair the computation, then submit its result.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
