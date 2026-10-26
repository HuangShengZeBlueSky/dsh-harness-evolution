// Load a released harness in its measured native DSH runtime.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Context} from '@deepseek-ai/cordis';

const artifact=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Usage: node tools/serve.mjs harnesses/<benchmark>/<release>');
const protocol=JSON.parse(fs.readFileSync(path.join(artifact,'protocol.json')));
const composition=JSON.parse(fs.readFileSync(path.join(artifact,'composition.json')));
const methods=composition.methods.map(m=>({...m,module:path.resolve(artifact,m.module)}));
const port=Number(process.env.PORT||8766);
const endpoint=process.env.MODEL_BASE_URL;
if(!endpoint)throw Error('Set MODEL_BASE_URL to your OpenAI-compatible model endpoint, including /v1.');
const state=path.resolve(process.env.HARNESS_STATE_DIR||'.runtime/'+path.basename(artifact));
fs.mkdirSync(state,{recursive:true});
const context=new Context();
let entries;
if(fs.existsSync(path.join(artifact,'runtime-profile.json'))){
 entries=JSON.parse(fs.readFileSync(path.join(artifact,'runtime-profile.json'))).map(entry=>{
  const config={...entry.config};
  if(entry.id==='sessions')config.root=path.join(state,'sessions');
  if(entry.id==='tau2-h0')Object.assign(config,{endpoint,port,methods,workspace:artifact,logRoot:path.join(state,'logs')});
  return {...entry,config};
 });
}else{
 entries=[
  ['cordis-plugin-timer',{}],['dsh-llm',{}],['dsh-session',{}],['dsh-session-projection',{}],
  ['dsh-system-prompt',{includeHarnessIdentity:false,includeRuntimeContext:false,personaPrefix:''}],
  ['dsh-tools',{}],['dsh-agent',{}],['dsh-agent-loop',{agents:[],maxParallelToolCalls:1}],
  ['dsh-session-persistence-jsonl',{root:path.join(state,'sessions'),compression:'none'}],
 ].map(([name,config])=>({name:'@deepseek-ai/'+name,config}));
 entries.push(...methods.map(m=>({name:m.module,config:m.config||{}})));
 entries.push({name:'lib/bridge.mjs',config:{port,endpoint,model:protocol.actor,temperature:protocol.temperature,maxTokens:protocol.max_tokens,maxSteps:protocol.max_steps??100000,timeoutMs:protocol.timeout_seconds*1000,maxRetries:protocol.max_retries,extraBody:protocol.extra_body||{},sendSeed:protocol.send_seed,apiKeyEnv:'MODEL_API_KEY',workspace:artifact,logRoot:path.join(state,'logs'),sessionRoot:path.join(state,'sessions'),readyFile:path.join(state,'ready.json'),methods}});
}
const fibers=[];
for(const entry of entries){
 const spec=entry.name.startsWith('@')?entry.name:pathToFileURL(path.resolve(artifact,entry.name)).href;
 const module=await import(spec);fibers.push(context.plugin(module.default??module,entry.config||{}));
}
await Promise.all(fibers);
console.log(`Harness loaded: ${path.basename(artifact)}; health: http://127.0.0.1:${port}/health`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await context.fiber.dispose();process.exit(0);});
