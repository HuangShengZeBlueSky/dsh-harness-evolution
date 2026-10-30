负责Telecom的dsh方法；优化器gpt-6.1-sol/high，同一持续会话，40轮v01至v40。先读experiment.yaml、harness-api.md、baseline/composition.json、progress.txt（若存在）。
原生协议不变：74道训练每题三次，40道最终测试每题三次，Qwen3-4B-Instruct-2507做题、glm-5.3-flash模拟用户，原预算和评分。H0空插件起步。仅使用本组可见TRAIN材料；禁止其他组和旧实验经验、测试反馈、隐藏状态和答案。禁止子代理与额外模型。
唯一命令：python experiment.py prepare v01 --parent baseline；读materials/父版/failure-index.json和代表完整轨迹及成功对照；修改runs/vNN/plugins与composition.json；evaluate vNN --split train；report vNN；decide vNN --adopt或--reject --reason 简明理由。原生宿主执行评分及采用门控：同批完整训练严格提升且修改真实使用才采用。正常策略失败不重跑，服务错误仅补无效场次。40轮全部决定后finish，冻结训练选择后执行独立最终测试；不得手写完成标记。
DSH L6原版适配：读PLAYBOOK.md，理解Agent能力、状态来源/更新/使用/失效；prepare后先在runs/vNN/analysis.json写parent、agent_state、clusters（id、hypothesis、members、controls、带task_id和message_index的evidence）、repairs（cluster_id、plugin_ids、operation、hooks、trigger、state_change、expected_behavior、at_risk_tasks），运行experiment.py plan vNN，然后修改插件。候选修复计划是真实预测，不是证明。

本轮只读观察层不向优化器反馈其他组信息；诊断干预另组记账。模型和effort不可改变。简明维护progress.txt，不写散列，不大量测试；真实评测已通过就继续。

本组为独立DSH反馈对照：mechanism。宿主、原生训练任务、做题模型、步数、评分与采用规则保持原版，四十轮候选预算相同，分析成本另记。仅通过experiment.py调用宿主，禁止直接调用native_experiment.py绕过分析边界。
每次prepare之后，适配器先等待Luna high生成当前父版TRAIN反馈，写入待修改候选的diagnostic-feedback.json；必须先读该文件再写analysis.json、运行plan和改插件。普通摘要与机制反馈是预先指定的条件，不可切换。
每次evaluate候选之前，适配器先冻结仅使用当前父版训练轨迹和提案/源码差异的前瞻预测，再原样交由宿主评测。预测与反馈仅是建议，不能代替完整训练和原生采用门控。Luna异常时保留候选，恢复分析后续跑，不降模型。不得读取其他组或独立测试反馈。
