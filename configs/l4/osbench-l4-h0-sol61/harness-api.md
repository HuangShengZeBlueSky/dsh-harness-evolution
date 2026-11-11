本组循环与采用规则以experiment.yaml和AGENTS.md为准；本文只说明开发接口。
本次方法2＋Playbook为20轮，全部协议以experiment.yaml为准。

原生DSH插件接口（本包已实现）

运行时使用固定版本的真实DSH Agent、Agent Loop、Tools和Cordis，不是自行模拟钩子。
每个episode建立独立Agent，插件在benchmark/setup内创建本episode的闭包状态。
composition.json: {"methods":[{"id":"plugin-name","module":"plugins/plugin-name.mjs","config":{}}],"selected":["plugin-name"]}
模块导出 name 与 apply(ctx, config)。模块路径相对候选目录。

export const name = 'plugin-name';
export function apply(ctx, config) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, agent, audit, getRawBusinessResult, getVisibleInput} = payload;
    // 此处创建状态、注册当前episode钩子。
  });
}

system-prompt/assemble:
ac.on('system-prompt/assemble', async (assembly, context, next) => {
  const result = await next();
  const text = 'Only evidence-grounded state or guidance';
  audit({method_id:name, hook:'system-prompt/assemble', text});
  return {...result, sections:[...result.sections,{name,order:25,text,interpolate:false}]};
});
可修改result.tools中的描述，保留其他字段与原业务语义。

tools/pre-execute:
ac.on('tools/pre-execute', async (call,next) => {
  const result=await next();
  if(result.kind!=='allow') return result;
  // call.name, call.arguments, call.callId
  // 需要拒绝时先audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
  // 再return {kind:'deny',reason}; 不拒绝就return result。
  return result;
});
每次拒绝也消耗一次action预算。给具体恢复路径；不要无限阻断有效任务。

tools/post-execute:
ac.on('tools/post-execute', async (call,result,next) => {
  const decision=await next();
  if(decision.kind!=='accept') return decision;
  // result.content为内容块列表，result.isError表示错误。
  // audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
  // return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
  return decision;
});

agent.session.snapshotEvents()提供当前会话事件。
user/message的消息为event.data；assistant/message和tool/result的消息为event.data.message。
content是{type:'text',text}或{type:'tool-call',id,name,arguments}列表。
getRawBusinessResult(callId)返回真实环境回执{content,error}；getVisibleInput()返回{step,messages}。
只能依据Agent实际看见的任务、环境反馈和实际回执建立事实。

内置python环境以环境对象提供的system_prompt和tools为准，详情见BENCHMARKS.md。

记录由运行器产生：requests保存实际模型请求，activations保存插件自报事件，executions保存环境调用和真实拒绝回执。
加载、事件触发、输入命中、实际拒绝、最终得分是不同层次。辅助模型调用不在本包接口内。
本包跨bench扩展通过环境接口完成；如必须修改DSH桥接，先建立并注明新的实验配置，不能暗改固定评测语义。

本次固定原OS工具、任务说明、容器环境、输出截断和评分。插件不得更改这些基础条件，不得访问其他组。测试只报告，训练决定晋级。


OS任务工具为bash_action(script)、answer_action(answer)、finish_action(thought)。命令在每题独立容器的持久Bash中运行；每题最多16次模型调用、16次工具尝试，输出按官方规则截断到800字符。成功由原始match/check评分；超轮数未提交按失败。不可访问宿主文件、Docker接口、判分脚本、fixtures或测试材料来设计插件。
