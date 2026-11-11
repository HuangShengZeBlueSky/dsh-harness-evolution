import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {Context} from '@deepseek-ai/cordis';
import * as bridge from './bridge.mjs';

const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const ctx=new Context();
const fibers=[];
for(const [name,options] of [
  ['cordis-plugin-timer',{}], ['dsh-llm',{}], ['dsh-session',{}],
  ['dsh-session-projection',{}],
  ['dsh-system-prompt',{includeHarnessIdentity:false,includeRuntimeContext:false,personaPrefix:''}],
  ['dsh-tools',{}], ['dsh-agent',{}], ['dsh-agent-loop',{agents:[],maxParallelToolCalls:1}],
  ['dsh-session-persistence-jsonl',{root:config.sessionRoot,compression:'none'}],
]) {
  const module=await import('@deepseek-ai/'+name);
  fibers.push(ctx.plugin(module.default??module,options));
}
for(const method of config.methods){
  const module=await import(pathToFileURL(method.module).href);
  if(module.name!==method.id)throw Error('Module name must equal composition id: '+method.id);
  fibers.push(ctx.plugin(module,method.config??{}));
}
fibers.push(ctx.plugin(bridge,config));
await Promise.all(fibers);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await ctx.fiber.dispose();process.exit(0);});
