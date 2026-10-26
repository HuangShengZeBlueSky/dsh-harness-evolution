/** YAML memory executed in JavaScript on DSH input and assembly hooks.
 * Retains the source prompt, final_result output tool, state-update timing and
 * previous state on failure. No Python policy or validation RPC is used.
 */
const clone=value=>structuredClone(value);
const pythonJson=value=>'{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+': '+JSON.stringify(item)).join(', ')+'}';
const initial=fields=>Object.fromEntries(fields.map(field=>[field.name,'尚未确定']));
const outputTool=fields=>({type:'function',function:{name:'final_result',description:'The final response which ends this conversation',parameters:{properties:Object.fromEntries(fields.map(field=>[field.name,{description:field.description,type:'string'}])),required:fields.map(field=>field.name),type:'object',additionalProperties:false}}});
const assistantMessage=message=>({role:'assistant',content:message.content||null,...(message.tool_calls?.length?{tool_calls:message.tool_calls.map(t=>({id:t.id,type:'function',function:{name:t.function.name,arguments:t.function.arguments}}))}:{})});
const retrySuffix='\n\nFix the errors and try again.';

function validateMemory(fields, argumentsJson) {
 let value;
 try { value = typeof argumentsJson === 'string' ? JSON.parse(argumentsJson) : argumentsJson; }
 catch { return {ok:false,feedback:'Invalid JSON output for final_result. Return an object containing the required string fields.'+retrySuffix}; }
 const errors=[];
 for(const field of fields) {
  if(!value || !Object.hasOwn(value,field.name))errors.push({type:'missing',loc:[field.name],msg:'Field required',input:value});
  else if(typeof value[field.name]!=='string')errors.push({type:'string_type',loc:[field.name],msg:'Input should be a valid string',input:value[field.name]});
 }
 if(errors.length)return {ok:false,feedback:JSON.stringify(errors,null,2)+retrySuffix};
 return {ok:true,value:Object.fromEntries(fields.map(field=>[field.name,value[field.name]]))};
}
export function installSourceMemory(ctx,method){
 ctx.on('telecom/setup',async(payload,next)=>{
  await next();const {ac,audit,auxiliaryLLM}=payload,c=method.config;
  if(!auxiliaryLLM)throw Error('Source memory requires same-actor auxiliaryLLM');
  const fields=c.fields,state={sequence:0,value:initial(fields),updates:0,errors:0};
  const retries=method.runtime?.num_retries??8;
  const emit=(hook,detail={})=>audit({method_id:method.id,surface:'memory',target:'agent',hook,...detail});
  const tools=[outputTool(fields)];
  emit('loaded',{mechanism:'advance-input-before-assembly',configuration:c,output_type:'ConfiguredUserMemory',output_tool:'final_result',output_retries:retries});
  ac.on('telecom/advance-input',async(event,next)=>{
   await next();
   if(event.sequence===state.sequence)return;
   state.sequence=event.sequence;
   const before=clone(state.value);
   const update=c.update_on==='every_agent_turn'||event.incoming.some(m=>m.role==='user');
   if(!update){emit('memory/update-skipped',{sequence:event.sequence,reason:'every_user_turn'});return;}
   // Match json.dumps(ensure_ascii=False), the original event __str__, and the
   // original Pydantic instruction stripping. No added JSON instruction.
   const messages=[{role:'system',content:c.system_prompt.trim()},{role:'user',content:'Previous memory:\n'+pythonJson(before)+'\n\nNewest visible event:\n'+event.latest_event}];
   let attempt=0;
   try{
    for(;;){
     const response=await auxiliaryLLM({purpose:'structured_memory',method_id:method.id,sequence:event.sequence,signal:event.signal,body:{messages:clone(messages),tools,tool_choice:'required'}});
     const message=response.message||response.response?.choices?.[0]?.message||response.choices?.[0]?.message;
     if(!message)throw Error('Memory response is missing its assistant message');
     const calls=message.tool_calls||[];
     if(!calls.length){
      if(attempt++>=retries)throw Error('Exceeded maximum output retries ('+retries+')');
      messages.push(assistantMessage(message),{role:'user',content:'Validation feedback:\nPlease include your response in a tool call.'+retrySuffix});
      emit('memory/retry',{sequence:event.sequence,attempt,reason:'output_tool_required',request_id:response.request_id??null});continue;
     }
     let value,needsRetry=false;const feedback=[];
     for(const call of calls){
      if(value!==undefined){feedback.push({role:'tool',tool_call_id:call.id,content:'Output tool not used - a final result was already processed.'});continue;}
      if(call.function.name!=='final_result'){
       needsRetry=true;feedback.push({role:'tool',tool_call_id:call.id,content:"Unknown tool name: '"+call.function.name+"'. Available tools: 'final_result'"+retrySuffix});continue;
      }
      const checked=validateMemory(fields,call.function.arguments);
      if(checked.ok){value=checked.value;feedback.push({role:'tool',tool_call_id:call.id,content:'Final result processed.'});}
      else {needsRetry=true;feedback.push({role:'tool',tool_call_id:call.id,content:checked.feedback});}
     }
     if(value!==undefined&&!needsRetry){
      state.value=value;state.updates++;
      emit('memory/update',{sequence:event.sequence,before,after:clone(value),latest_event:event.latest_event,incoming:event.incoming,request_id:response.request_id??null,usage:response.usage??null,output_tool:'final_result',attempts:attempt+1});return;
     }
     if(attempt++>=retries)throw Error('Exceeded maximum output retries ('+retries+')');
     if(needsRetry&&value!==undefined)for(const item of feedback)if(item.content==='Final result processed.')item.content='Output not used as the final result - addressing tool retries from this round first.';
     messages.push(assistantMessage(message),...feedback);emit('memory/retry',{sequence:event.sequence,attempt,feedback,request_id:response.request_id??null});
    }
   }catch(error){
    // Original generate_next_message catches memory failure, preserves the old
    // state and proceeds to the actor. It does not invalidate/retry the episode.
    if(event.signal?.aborted)throw error;
    state.errors++;emit('memory/update-error',{sequence:event.sequence,before,after:clone(state.value),error:error.message,actor_continues_with_previous_memory:true});
   }
  });
  ac.on('system-prompt/assemble',async(assembly,context,next)=>{
   const value=await next();const text='<structured_memory>\n'+pythonJson(state.value)+'\n</structured_memory>';
   emit('system-prompt/assemble',{sequence:state.sequence,text,memory:clone(state.value)});
   return {...value,sections:[...value.sections,{name:'faithful-structured-memory',order:20,text,interpolate:false}]};
  });
 });
}
