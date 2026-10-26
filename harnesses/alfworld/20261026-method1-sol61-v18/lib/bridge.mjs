/** Native DSH bridge extracted from the Astra campaign; environment and scoring stay external. */
import {createServer} from 'node:http';
import {mkdirSync,appendFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {LlmAdapter,createUserMessage,createAssistantMessage,createSystemMessage,createMessage,createToolResultMessage,isAgentLoopRequest} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
export const name='astra-benchmark-bridge';
export const inject=['llm','agents','sessions','tools','systemPrompt'];
const textContent=m=>m.content.filter(b=>b.type==='text').map(b=>b.text).join('');
function projected(messages){return messages.map(m=>{
 const content=textContent(m);
 if(m.role==='tool')return {role:'tool',content,tool_call_id:m.source.callId};
 if(m.role==='assistant')return {role:'assistant',content:content||null,tool_calls:m.content.filter(b=>b.type==='tool-call').map(b=>({id:b.id,type:'function',function:{name:b.name,arguments:b.arguments}}))};
 return {role:m.role,content};
});}
export function apply(ctx,config){
 const states=new Map();mkdirSync(config.logRoot,{recursive:true});
 const log=(id,file,value)=>appendFileSync(join(config.logRoot,id,file),JSON.stringify(value)+'\n');
 class Adapter extends LlmAdapter{
  async *stream(options){
   const s=states.get(options.sessionId);if(!s)throw Error('Unknown benchmark session');
   if(!s.expected)await new Promise((resolve,reject)=>{s.awaitAdvance=resolve;options.signal.addEventListener('abort',()=>reject(Error('Session closed while waiting for environment')),{once:true});});
   const actual={messages:projected(options.messages),tools:options.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}}))};
   const body={...config.extraBody,model:config.model,messages:actual.messages,tools:actual.tools,tool_choice:'auto',temperature:config.temperature,max_tokens:config.maxTokens,stream:false};
   if(config.sendSeed)body.seed=s.seed;
   log(s.id,'requests.jsonl',{at:Date.now(),step:s.step,body});s.expected=null;
   let response;
   for(let attempt=0;attempt<=config.maxRetries;attempt++){
    try{
     const r=await fetch(config.endpoint+'/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','X-Astra-Session':s.id,...(config.apiKeyEnv&&process.env[config.apiKeyEnv]?{Authorization:'Bearer '+process.env[config.apiKeyEnv]}:{})},body:JSON.stringify(body),signal:AbortSignal.any([options.signal,AbortSignal.timeout(config.timeoutMs)])});
     if(!r.ok)throw Error('Model HTTP '+r.status+': '+await r.text());response=await r.json();break;
    }catch(e){log(s.id,'transport.jsonl',{at:Date.now(),step:s.step,attempt,error:e.message});if(attempt===config.maxRetries||options.signal.aborted)throw e;await new Promise(r=>setTimeout(r,1000));}
   }
   log(s.id,'responses.jsonl',{at:Date.now(),step:s.step,response});s.raw=response;
   const m=response.choices[0].message;const blocks=[];
   if(m.content)blocks.push({type:'text',text:m.content});
   for(const t of m.tool_calls||[])blocks.push({type:'tool-call',id:t.id,name:t.function.name,arguments:t.function.arguments});
   for(let index=0;index<blocks.length;index++){
    const block=blocks[index];yield {type:'block-start',index,blockType:block.type};
    if(block.type==='text')yield {type:'text-delta',index,text:block.text};
    else yield {type:'tool-call-delta',index,id:block.id,name:block.name,argumentsDelta:block.arguments};
    yield {type:'block-end',index,block};
   }
   if(response.usage)yield {type:'usage',usage:{inputTokens:response.usage.prompt_tokens,outputTokens:response.usage.completion_tokens}};
   yield {type:'finish',reason:{kind:m.tool_calls?.length?'tool-calls':response.choices[0].finish_reason==='length'?'max-tokens':'stop'}};
  }
 }
 ctx.llm.registerAdapter(['astra-bench'],new Adapter());
 ctx.on('session/event',(session,event)=>{
  const s=states.get(session.id);if(!s)return;log(s.id,'session.jsonl',event);
  if(event.type==='tool/result'){const m=event.data.message;const result={content:textContent(m),error:!!m.isError,business:s.business.has(m.source.callId),attempts:s.attempts};s.toolResults.set(m.source.callId,result);const w=s.toolWaiters.get(m.source.callId);if(w){s.toolWaiters.delete(m.source.callId);w(result);}}
  if(event.type==='assistant/message'&&s.waiter){const w=s.waiter;s.waiter=null;w.resolve({session_id:s.id,response:s.raw});}
  if(event.type==='turn/end'&&s.waiter){const w=s.waiter;s.waiter=null;w.reject(Error('Dsh turn ended before response: '+JSON.stringify(event.data)));}
 });
 async function open(body){
  const id='h0-'+randomUUID(),s={rawBusiness:new Map(),denials:new Map(),currentInput:[],id,seed:body.seed,step:0,attempts:0,expected:null,waiter:null,results:new Map(),pending:new Map(),business:new Set(),toolResults:new Map(),toolWaiters:new Map(),awaitAdvance:null};states.set(id,s);mkdirSync(join(config.logRoot,id));
  s.handle=await ctx.agents.create({sessionId:SessionId(id),meta:{cwd:config.workspace},agentOptions:{provider:'astra-bench',model:config.model,maxTokens:config.maxTokens},setup:async(ac,agent)=>{
   agent.session.append("turn/start",{turn:1});
   agent.session.append("step/start",{turn:1,step:1});
   agent.session.append("system/message",{turn:1,step:1,message:createSystemMessage(body.system_prompt)},{surfaceOp:"append"});
   for(const m of body.history||[]){
    const content=[];if(m.content)content.push({type:"text",text:m.content});
    for(const t of m.tool_calls||[])content.push({type:"tool-call",id:t.id,name:t.function.name,arguments:t.function.arguments});
    if(m.role==="assistant")agent.session.append("assistant/message",{turn:1,step:1,stream:[],message:createAssistantMessage({content,source:{provider:"astra-bench",model:config.model}})},{surfaceOp:"append"});
    else if(m.role==="user")agent.session.append("user/message",createUserMessage({content,source:{kind:"user"}}),{surfaceOp:"append"});
    else if(m.role==="tool")agent.session.append("tool/result",{turn:1,step:1,message:createToolResultMessage({content,callId:m.tool_call_id,isError:false})},{surfaceOp:"append"});
   }
   agent.session.append('step/end',{turn:1,step:1});
   agent.session.append('turn/end',{turn:1,reason:{kind:'completed'}});
   ac.systemPrompt.section({name:'astra-bench',order:0,text:body.system_prompt,complete:false,interpolate:false});
   ac.on('agent/request',async (p,next)=>({...await next(),temperature:config.temperature}));
   ac.on('system-prompt/assemble',async (assembly,context,next)=>{const a=await next();a.tools.sort((x,y)=>body.tools.findIndex(t=>t.function.name===x.name)-body.tools.findIndex(t=>t.function.name===y.name));return a;});
   for(const t of body.tools)ac.tools.register({...t.function,output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},execute:async(args,exec)=>{
    const r=await fetch(body.executor_url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({executor_id:body.executor_id,call:{id:exec.callId,name:exec.name,arguments:args,requestor:'assistant'}}),signal:exec.signal});
    if(!r.ok)throw Error('Benchmark environment execution failed: '+r.status);
    const response=await r.json();s.business.add(exec.callId);s.rawBusiness.set(exec.callId,response);log(s.id,'executions.jsonl',{source:'runner',effective:true,decision:'execute',call_id:exec.callId,name:exec.name,args,error:!!response.error,content:response.content,attempt:s.attempts});
    // Preserve the environment result verbatim; native post-processing changes only the model view.
    return response.content;
   }});
   // Preserve business error state through a native around-dispatch hook.
   ac.on('tools/execute',async(exec,next)=>{
    const result=await next();const raw=s.rawBusiness.get(exec.callId);
    return raw?.error?{content:[{type:'text',text:raw.content}],isError:true,error:{message:raw.content}}:result;
   });
   const audit=value=>{if(value.hook==='tools/pre-execute'&&value.decision==='deny'){const m=config.methods.find(m=>m.id===value.method_id);s.denials.set(value.call_id,{method_id:value.method_id,implementation:m?.implementation,surface:m?.surface,origin:m?.implementation==='legacy-tau2_validators'?'tau2-validator':m?.implementation==='legacy-pydantic_validators'?'pydantic-validator':'native-plugin'});}log(s.id,'activations.jsonl',{at:Date.now(),step:s.step,...value});};
   ac.on('tools/pre-execute',async(call,next)=>{
    s.attempts++;
    let decision;
    if(s.attempts>config.maxSteps)decision={kind:'deny',reason:'Episode action budget exhausted.'};
    else decision=await next();
    if(decision.kind==='deny')log(s.id,'executions.jsonl',{source:'runner',method_id:s.denials.get(call.callId)?.method_id??'budget',effective:true,decision:'deny',call_id:call.callId,name:call.name,reason:decision.reason,attempt:s.attempts});
    return decision;
   });
   await ctx.waterfall('benchmark/setup',{ac,agent,body,audit,getVisibleInput:()=>({step:s.step,messages:s.currentInput}),getRawBusinessResult:callId=>s.rawBusiness.get(callId),getPreExecutionDenial:callId=>s.denials.get(callId)},()=>Promise.resolve());

  }});
  writeFileSync(join(config.logRoot,id,"session.jsonl"),s.handle.agent.session.snapshotEvents().map(e=>JSON.stringify(e)).join("\n")+"\n");
  writeFileSync(join(config.logRoot,id,"identity.json"),JSON.stringify({id,seed:body.seed,model:config.model,temperature:config.temperature,maxTokens:config.maxTokens,historyOrigin:"benchmark-initial-observation"}));
  for(const m of config.methods)log(id,'activations.jsonl',{method_id:m.id,hook:'loaded'});
  return {session_id:id};
 }
 async function advance(body){
  const s=states.get(body.session_id);if(!s)throw Error('Unknown session');if(s.waiter)throw Error('Concurrent advance');
  s.step++;s.currentInput=body.input;s.expected={};if(s.awaitAdvance){const w=s.awaitAdvance;s.awaitAdvance=null;w();}
  const promise=new Promise((resolve,reject)=>{s.waiter={resolve,reject};});
  for(const m of body.input){
   if(m.role==='user')s.handle.agent.followup(createUserMessage({content:[{type:"text",text:m.content}],source:{kind:"user"}}));
   else if(m.role==='tool'){/* already committed by native tool execution */}
   else throw Error('Unsupported input role');
  }
  return promise;
 }
 const server=createServer(async(req,res)=>{
  try{
   if(req.url==='/health'){res.end(JSON.stringify({ok:true,sessions:states.size,profile:'astra-bench',loop:'dsh-agent-loop'}));return;}
   let raw='';for await(const b of req){raw+=b;if(raw.length>10000000)throw Error('Request too large');}const body=JSON.parse(raw);
   let value;if(req.url==='/open')value=await open(body);else if(req.url==='/advance')value=await advance(body);else if(req.url==='/result'){const s=states.get(body.session_id);value=s.toolResults.has(body.call_id)?s.toolResults.get(body.call_id):await new Promise(resolve=>s.toolWaiters.set(body.call_id,resolve));}else if(req.url==='/close'){
    const s=states.get(body.session_id);if(s){if(s.waiter){s.waiter.reject(Error('Closed'));s.waiter=null;}await s.handle.dispose();states.delete(s.id);}value={ok:true};
   }else throw Error('Unknown endpoint');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));
  }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}
 });
 server.listen(config.port ?? 0,'127.0.0.1',()=>writeFileSync(config.readyFile,JSON.stringify({port:server.address().port}))); ctx.effect(()=>async()=>{for(const s of states.values())await s.handle.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));});
}
