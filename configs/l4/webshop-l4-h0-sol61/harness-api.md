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

本实验WebShop提供search_action({keywords:string})和click_action({value:string})。初始观察和每步回执公开Available Actions。原始环境返回reward，严格成功为reward=1。仅可依据公开观察，不读取商品库、隐藏目标或测试轨迹。每题20次模型调用和最多20次动作尝试，拒绝也计预算。
从空插件出发，训练每轮50题，公开六批循环至40轮；测试固定0到199各3次，仅最终选择结束后评测baseline与best。只看本组训练材料，不读取其他组。
