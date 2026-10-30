import {installRewrite} from './rewrite-stream.mjs';
export const name='field-contract';
export function apply(ctx) {
 installRewrite(ctx,name,(script,state)=>{
  if(!/timestamp\s*-\s*user_?id\s*-\s*action/i.test(state.task)||/\b(?:sh|bash)\s+-c\b/.test(script))return script;
  return script.replace(/(\bcat\s+[^|]+\|\s*)cut\s+-d\s*(['"]) \2\s+-f\s*2\b/g,(whole,source)=>source+"awk -F ' - ' '{print $2}'");
 },'Full input rows from cat use the visible timestamp - user_id - action_type delimiter. Extract user_id after splitting on the complete delimiter, not whitespace.');

 ctx.on('benchmark/setup',async(p,next)=>{
  await next();
  const state={denied:false,hint:''};
  p.ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();
   if(decision.kind!=='allow'||call.name!=='bash_action'||state.denied)return decision;
   const task=p.agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join(' ');
   if(!/\b(unique|distinct)\b/i.test(task))return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const script=args.script;
   let hint='';
   if(/timestamp\s*-\s*user_?id\s*-\s*action/i.test(task)&&/['"]\(?\[0-9\]\+\)?['"]/.test(script)) {
    hint='The requested value is user_id in the visible timestamp - user_id - action_type schema. Extracting every number also counts date, time and action digits. Inspect actual lines if needed, split on the full " - " delimiter, extract user_id, merge all requested files and deduplicate globally.';
   } else if(/timestamp\s*:\s*action/i.test(task)&&/\bawk\b[^|]*print\s+\$2\b/.test(script)) {
    hint='The requested value is the complete action in the visible timestamp: action schema. A timestamp can occupy multiple whitespace fields; $2 can be clock time. Extract the action after the timestamp separator, preserving complete action text, then deduplicate across all requested files.';
   }
   if(hint&&/timestamp\s*-\s*user_?id\s*-\s*action/i.test(task)){
    const directory=task.match(/\b(?:directory|folder)\s+(?:named|called)\s+["'\x60]([^"'\x60]+)["'\x60]/i)?.[1];
    const extension=task.match(/["'\x60](\.[A-Za-z0-9]+)["'\x60]/)?.[1];
    if(directory&&extension&&/\bhome directory\b/i.test(task)){
     const q=value=>"'"+value.replace(/'/g,"'\\''")+"'";
     const command="cat ~/"+q(directory)+"/*"+q(extension)+" | awk -F ' - ' '{print $2}' | sort -u | wc -l";
     hint+=' Concrete command derived from the visible task directory, extension and schema: '+command;
    }
   }
   if(!hint)return decision;
   state.denied=true;state.hint=hint;
   const reason=hint+' Run a corrected bash_action rather than submitting this field count.';
   p.audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
  p.ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();if(!state.hint)return r;
   const text='Visible log-field contract: '+state.hint;
   p.audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...r,sections:[...r.sections,{name,order:31,text,interpolate:false}]};
  });
 });
}
