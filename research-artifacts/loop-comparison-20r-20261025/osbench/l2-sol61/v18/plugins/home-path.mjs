export const name='home-path';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit}=p;let corrected=false,suggestion='';
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||call.name!=='bash_action'||corrected)return d;
  const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
  if(!a.script.includes('~\\/'))return d;
  suggestion=a.script.replaceAll('~\\/','~/').replaceAll('\\*-name','-name');
  corrected=true;const reason='Escaping the slash after ~ disables home expansion and searches a literal tilde path. Call bash_action again with the repaired command: '+suggestion;
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(call.name==='bash_action'&&suggestion){const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(!a.script.includes('~\\/'))suggestion='';}return d;});
 ac.on('system-prompt/assemble',async(a,c,next)=>{
  const r=await next();if(!suggestion)return r;
  const text='Pending path correction: '+suggestion+'\nUse this unescaped ~/ path. The rejected literal-tilde command did not establish that files are absent. Execute the corrected computation before answering.';
  audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:30,text,interpolate:false}]};
 });
});}
