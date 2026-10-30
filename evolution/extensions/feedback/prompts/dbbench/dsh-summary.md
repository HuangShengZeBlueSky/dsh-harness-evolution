负责DBBench的L6归因与能力状态循环。Sol6.1 high，H0空增强插件起步，40轮v01至v40。先读experiment.yaml、PLAYBOOK.md、harness-api.md和progress.txt（不存在则创建）。
每轮：python experiment.py prepare v01 → 读父版源码与本轮真实训练轨迹 → 写候选analysis.json → experiment.py plan v01 → 实现插件 → evaluate v01 --split development → report v01 → decide v01 --adopt或--reject --reason 简明理由。所有命令用上述Python；不改experiment.py或运行器。
重点保证五项能力：日志归因聚类；每类问题到一个或一批插件；先理解Agent已有能力；理解状态来源/更新/使用/失效再计划；用真实输入、控制回执、行为与任务结果检查触发和效果。没有读懂不能用自动钩子列表冒充。消息索引是材料traces中的messages零基位置。
plan必须在改插件之前记录；可以联合增删改多个插件，需写入计划。运行器自动检查同批完整严格成功提升与实际生效。WebShop平均奖励只是辅助。不要跳过失败轮次或重跑正常失败；基础设施错误修好后只补无效结果。一次评测执行后等待，不开重复进程。
只读本组TRAIN轨迹，不读测试/其他实验的新候选或经验；不从fixtures、数据答案和评分器取解题信息。保持原生任务、评分、做题模型、步数不变。每个插件状态按任务隔离。不中途变换优化器，不生成子代理，不调用额外模型，不计算文件散列。公共协议已冻结；仅插件与本组分析可以修改。
40轮决定后finish，锁定最后采用的检查点并进行唯一最终测试。没有完成不得写完成标记。简明维护progress.txt，遇到无触发先检查接线和状态；自报钩子事件不等于真实生效，真实生效也不等于因果增益。

接口文档末尾的历史轮数或不循环说明仅为旧运行说明；本组唯一协议入口experiment.yaml明确40轮、六批循环，以此为准。

本组为独立DSH反馈对照：summary。宿主、原生训练任务、做题模型、步数、评分与采用规则保持原版，四十轮候选预算相同，分析成本另记。仅通过experiment.py调用宿主，禁止直接调用native_experiment.py绕过分析边界。
每次prepare之后，适配器先等待Luna high生成当前父版TRAIN反馈，写入待修改候选的diagnostic-feedback.json；必须先读该文件再写analysis.json、运行plan和改插件。普通摘要与机制反馈是预先指定的条件，不可切换。
每次evaluate候选之前，适配器先冻结仅使用当前父版训练轨迹和提案/源码差异的前瞻预测，再原样交由宿主评测。预测与反馈仅是建议，不能代替完整训练和原生采用门控。Luna异常时保留候选，恢复分析后续跑，不降模型。不得读取其他组或独立测试反馈。
