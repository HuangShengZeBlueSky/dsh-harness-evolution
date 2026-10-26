# 当前Agent结构与插件能力
父版：v32。执行链：任务/可见消息 → 做题模型 → DSH工具前处理 → 真实环境 → 回执/状态更新 → 下一步。
以下为源码登记事实；实际能力与覆盖需结合本组训练轨迹判断。

- schema-contract：plugins/schema-contract.mjs；源码钩子：benchmark/setup, system-prompt/assemble, tools/post-execute, tools/pre-execute。
- literal-contract：plugins/literal-contract.mjs；源码钩子：benchmark/setup, system-prompt/assemble。
- write-workflow：plugins/write-workflow.mjs；源码钩子：benchmark/setup, system-prompt/assemble, tools/post-execute, tools/pre-execute。
- result-bridge：plugins/result-bridge.mjs；源码钩子：benchmark/setup, system-prompt/assemble, tools/post-execute, tools/pre-execute。
- sql-recovery：plugins/sql-recovery.mjs；源码钩子：benchmark/setup, system-prompt/assemble, tools/post-execute, tools/pre-execute。
- budget-conductor：plugins/budget-conductor.mjs；源码钩子：benchmark/setup, system-prompt/assemble, tools/post-execute。
- numeric-calendar：plugins/numeric-calendar.mjs；源码钩子：benchmark/setup, system-prompt/assemble, tools/pre-execute。
- intent-contract：plugins/intent-contract.mjs；源码钩子：benchmark/setup, system-prompt/assemble, tools/pre-execute。

## 本轮分析
由优化器补充：每个插件解决的问题、已验证能力、当前薄弱点、重叠/冲突、下一候选的新职责。先维护此处，再提出插件。

职责与已知边界：
- schema-contract：公开schema识别、原始名称及MySQL引用；状态记录schema错误；组装提示及工具说明，按配置有限拒绝保留字漏引。 当前配置{"guard": false, "errorMemory": true, "concise": true}；已有父版完整成绩，不把单次提示触发当作已修复。
- literal-contract：字段原值与存储格式；只取公开taskContext.table中的样例，保留Unicode、日期空格和所有请求字段；组装提示。 当前配置{"samples": 5, "limit": 7500, "strict": true, "relevantRows": true}；已有父版完整成绩，不把单次提示触发当作已修复。
- write-workflow：读写操作分离；以真实回执记录成功DML，指导完成实际写入、保留未变字段、定向核查；工具后处理及状态提示。 当前配置{"verify": false, "receipt": true, "proof": true, "dedupe": true}；已有父版完整成绩，不把单次提示触发当作已修复。
- result-bridge：真实commit与结果投影；解析真实SELECT元组、保留全部列，提示实际函数调用；不代做提交，按配置有限拦截未查询结束。 当前配置{"annotate": true, "live": true, "guard": true, "selectOnly": true}；已有父版完整成绩，不把单次提示触发当作已修复。
- sql-recovery：SQL错误及空结果恢复；基于原始回执建立错误记忆，提供修复方向，按配置有限拒绝重复失败语句。 当前配置{"memory": true, "guard": true}；已有父版完整成绩，不把单次提示触发当作已修复。
- budget-conductor：固定15次调用内的进度与提交时机；读取可见步数和实际SQL回执，动态提示，不增加调用预算。 当前配置{"threshold": 9, "last": true}；已有父版完整成绩，不把单次提示触发当作已修复。
- numeric-calendar：文本数字、日期排序和极值语义；区分Rank/Lane及数值/姓名投影；组装指导，不访问标准SQL。 当前配置{"ties": false, "formats": true, "selectOnly": true, "relevantOnly": true, "profile": true, "guard": true}；已有父版完整成绩，不把单次提示触发当作已修复。
- intent-contract：任务输出对象、完整条件及读写意图；依据公开任务重投影，不把热次等同泳道；组装提示。 当前配置{"precise": false, "concise": true, "directionGuard": true}；已有父版完整成绩，不把单次提示触发当作已修复。
父版v32同批5：36/50。失败现象{"SQL报错": 3, "空结果": 0, "缺实际提交": 5}。成功对照显示需要真实工具执行、完整字段及真实提交；失败也包含数据语义问题，不能都归于SQL语法。
本轮职责：schema-contract；schema错误记录与恢复插件重复；撤去schema错误记忆，仅保留精确名称和有限保留字拦截。；保留父版其他配置，候选配置{"guard": true, "errorMemory": false, "concise": true}。
