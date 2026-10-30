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

本实验ALFWorld暴露take_action({action:string})一个工具。初始观察包含任务说明，之后环境反馈作为工具结果。
合法动作列表是否可见由固定配置决定；不得在候选中偷偷读取专家计划或隐藏世界状态。
内置python环境以环境对象提供的system_prompt和tools为准，详情见BENCHMARKS.md。

记录由运行器产生：requests保存实际模型请求，activations保存插件自报事件，executions保存环境调用和真实拒绝回执。
加载、事件触发、输入命中、实际拒绝、最终得分是不同层次。辅助模型调用不在本包接口内。
本包跨bench扩展通过环境接口完成；如必须修改DSH桥接，先建立并注明新的实验配置，不能暗改固定评测语义。

本次已固定公开合法动作列表、Life-Harness原始任务说明与基础动作规范化。插件不得更改这些基础条件，不得访问其他组。验证和测试结果只报告，训练决定晋级。


本实验领域为 DBBench，工具是 execute_sql(query) 与 commit_final_answer(answers)，不是 ALFWorld。每题15次模型调用，4096输出，上下文32768。benchmark/setup 的 taskContext 含官方公开 description/type/table/evidence/add_description；不含答案或标准SQL。插件可以使用它维护状态和组织提示。评分沿用原生DBBench。所有大日志和临时文件放本实验目录，禁止写/tmp。每轮50题；六轮分别使用六批，不循环；最后300题各3遍。不得读取测试轨迹或参考Life-Harness策略源码，不跨组学习。
