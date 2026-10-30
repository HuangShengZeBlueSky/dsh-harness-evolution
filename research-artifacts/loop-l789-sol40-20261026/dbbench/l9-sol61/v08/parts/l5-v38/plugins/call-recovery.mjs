import {createUserMessage} from '@deepseek-ai/dsh-llm';
export const name='call-recovery';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{
 await next();let recoveries=0;const seen=new Set();
 p.ac.on('agent/pre-step',async(step,n)=>{
  const d=await n();if(d.kind!=='enter')return d;
  const correction=p.getVisibleInput().messages.some(m=>m.role==='user'&&/^(?:No executable tool calls found|Harness:)/i.test(m.content||''));
  if(!correction)return d;
  const session=p.agent.session,events=session.snapshotEvents(),nodes=new Set(session.surface.nodes);
  const e=events.filter(e=>e.type==='assistant/message'&&nodes.has(e.seq)).at(-1);
  if(!e||seen.has(e.seq)||e.data.message.content.some(b=>b.type==='tool-call'))return d;
  seen.add(e.seq);recoveries++;
  let recovered='';
  const body=e.data.message.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');
  for(const match of body.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)){
   let proposed;try{proposed=JSON.parse(match[1]);}catch{try{proposed=JSON.parse(match[1].replace(/(?<!\\)\\'/g,"''"));}catch{continue;}}
   if(proposed?.name==='execute_sql'&&typeof proposed.arguments?.query==='string'){
    recovered=' Recovered executable arguments from the preceding displayed proposal (not executed): execute_sql '+JSON.stringify(proposed.arguments)+'. The invalid JSON apostrophe escape, if present, was represented as equivalent SQL doubled single quotes. Use the actual tool with these valid arguments only if this operation has not already succeeded; then inspect the actual result and commit.';break;
   }
  }
  const commit=body.match(/(?:^|\n)\s*-?commit_final_answer\s*\(\s*(\{[\s\S]*?\})\s*\)/i);
  if(commit){try{const a=JSON.parse(commit[1]);if(Array.isArray(a.answers)&&a.answers.every(x=>typeof x==='string'))recovered=' Recovered final-submission arguments from the preceding text (not submitted): commit_final_answer '+JSON.stringify(a)+'. Use the actual registered commit function; a text rendering is not a submission.';}catch{}}
  if(!recovered){const fenced=body.match(/```sql\s*([\s\S]*?)```/i);if(fenced&&/^\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE)\b/i.test(fenced[1]))recovered=' Recovered SQL from the visible fenced proposal (not executed): execute_sql '+JSON.stringify({query:fenced[1].trim()})+'. These are valid JSON arguments preserving the visible SQL, including quote characters. Use the real function only if the requested operation has not already succeeded; otherwise commit. Inspect the actual execution result.';}
  const text='Harness recovery: the preceding assistant response did not invoke an executable tool. No SQL or final submission happened from that response. Use the actual registered function-calling API. If the requested write already succeeded, submit a short done answer through commit_final_answer; do not repeat the write. A displayed function signature or XML text is not an invocation.'+recovered;
  session.append('user/message',createUserMessage({content:[{type:'text',text}],source:{kind:'call-recovery',form:'notice',summary:'Summarized a failed non-executable response'}}),{surfaceOp:{op:'replace',startSeq:e.seq,endSeq:e.seq},sourceEventSeqs:[e.seq]});
  p.audit({method_id:name,hook:'agent/pre-step',text,source_seq:e.seq,recoveries});return d;
 });
 p.ac.on('system-prompt/assemble',async(a,c,n)=>{
  const r=await n();if(!recoveries)return r;
  const text='Call recovery is active after '+recoveries+' failed non-executable responses. Choose a real function call now. For a completed modification use commit_final_answer with answers containing only "done". Keep the explanation brief and use the registered tool channel, not a text rendering of JSON or a function signature.';
  p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:45,text,interpolate:false}]};
 });
});}
