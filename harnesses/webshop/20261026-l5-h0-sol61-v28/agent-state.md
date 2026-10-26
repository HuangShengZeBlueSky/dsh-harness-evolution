# 当前Agent能力与本轮诊断
父版v25，本轮v28，训练batch-04。固定20次动作/模型调用，业务环境与评分不变。
- option-ledger：维护页面规格组与真实选项点击，在系统提示和回执中投影；已验证减少漏选，但不证明商品身份或全部属性。 当前配置{}；事实解析版本：模块内独立状态。
- search-evidence：解析公开任务和结果标题，整理无价格查询并突出缺失词；词覆盖不是完整成功证明。 当前配置{"top": 3}；事实解析版本：模块内独立状态。
- checkout-loop：在明确未选需求规格时有限阻止提前购买，给出下一合法选项；原生执行模式可在购买前串行确认唯一明确规格，累计所有尝试不超过20，购买仍调用真实工具。 当前配置{"auto": true, "delegate": true, "manualFirst": true, "exact": true, "compound": true, "maxAutoOptions": 3, "phaseOnly": true}；事实解析版本：../lib/visible.mjs。
- price-evidence：从公开价格和用户上限判断明确超价，范围价仅报告范围，不使用隐藏变体价格。 当前配置{"gate": true, "recoverBudget": true, "maxRecoveries": 1, "phaseOnly": true, "warnOnly": true}；事实解析版本：../lib/visible-v25.mjs。

本轮重点：部分奖励但严格失败的训练轨迹。
训练922奖励0.750：i am looking for a sulfate & paraben free shampoo, and price lower than 40.00 dollars；动作{"keywords": "sulfate & paraben free shampoo"} → {"value": "b008j2gp9g"} → {"value": "buy now"}
训练935奖励0.750：i need a tuna creations bold, rice and beans in soy free hot sauce flavored tapatio, 2.6 ounce (pack of 1), and price lower than 60.00 dollars；动作{"keywords": "tuna creations bold rice and beans soy free hot sauce flavored tapatio 2.6 ounce (pack of 1)"} → {"keywords": "tuna creations bold rice and beans soy free hot sauce tapatio 2.6 ounce pack of 1"} → {"value": "b0751ng9vn"} → {"value": "2.6 ounce (pack of 1)"} → {"value": "buy now"}
训练719奖励0.750：look for a four pack of white karahi spice mix that's easy to use, and price lower than 30.00 dollars；动作{"keywords": "a four pack of white karahi spice mix that's easy to use"} → {"value": "b08xm81s7m"} → {"value": "karahi"} → {"value": "pack of 4"} → {"value": "buy now"}

能力缺口与修改：超预算结果点击恢复。在模型拟打开公开价超预算的搜索结果时，最多一次原生打开同页预算内且需求标题证据最强的候选；不替代模型核验属性或购买。 配置{"earlyBudget": true, "maxRecoveries": 1, "phaseOnly": true}。独立闭包记忆以实际可见回执为事实源，同版联合职责共享公开观测状态；继承插件保留原解析版本，新职责通过同一真实工具事件获得事实。各库记录全部工具尝试与模型回复，比较停止使用两种预算的较小剩余量。
预算搜索恢复：模型拟点击公开价明确超预算的结果时，最多一次原生打开同页预算内候选并交还真实商品页，保留原始全部需求核验和真实购买。
