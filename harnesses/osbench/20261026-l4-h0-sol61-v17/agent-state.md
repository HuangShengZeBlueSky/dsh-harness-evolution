# 当前Agent能力与候选职责
当前父版：v08；原生Linux工具、固定做题模型和16步预算保持不变。
- inspection-contract：任务检查与先取样后统计指导；已知提示本身不能保证字段正确。；钩子：benchmark/setup, system-prompt/assemble。状态为每题闭包，不跨任务共享；职责以模块登记为准。
  已知边界：提示进入输入不保证正确执行。
- global-projection：全局去重前剥离多文件grep名称前缀；单次前置纠偏，保留原业务命令。；钩子：benchmark/setup, tools/pre-execute。状态为每题闭包，不跨任务共享；职责以模块登记为准。
  已知边界：只处理去重键中的名称前缀，不保证语义字段正确。
- sample-evidence：要求统计前读取真实输入样本，避免按描述猜字段；每题最多一次拦截。；钩子：benchmark/setup, tools/post-execute, tools/pre-execute。状态为每题闭包，不跨任务共享；职责以模块登记为准。
  已知边界：读取样本不保证正确使用；宽范围版本曾干扰元数据任务。
- task-contract：建立筛选、抽取、聚合、输出及副作用契约，区分原始记录和目标值。；钩子：benchmark/setup, system-prompt/assemble。状态为每题闭包，不跨任务共享；职责以模块登记为准。
父版完整训练仍有25场失败；能力不等于全面覆盖。
已知失败E0005：末条真实命令{"script": "grep \"2023-10-02T15:30:00\" access.log | wc -l"}。
已知失败E0007：末条真实命令{"script": "grep -oE '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}' $HOME/log_files/access1.log $HOME/log_files/access2.log | sort -u | wc -l"}。

本轮缺口与新职责：记录重复命令与真实回执，连续重复后单次引导改策略或提交。
职责衔接：保留父版已采用能力；本插件仅处理上述问题，使用可见任务、真实工具调用及回执；不写入答案或调用额外模型。已采用只代表开发集满足规则，未证明泛化。
