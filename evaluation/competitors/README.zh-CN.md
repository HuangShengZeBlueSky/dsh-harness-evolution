# 竞争方法共同评测

这一批固定Qwen3-4B，在已有ALFWorld原生环境、共同109个valid-unseen任务上各测三遍。原作者的模型成绩、本地跨执行模型迁移成绩分别记录。

| 方法 | 使用的产物 | 执行预算 |
|---|---|---|
| ReAct | ReflAct论文附录中的匹配ReAct指令与两条示例 | 最多50次模型调用、4096输出Token/次 |
| ReflAct | 原论文Appendix K.1指令与两条示例 | 最多50次模型调用、4096输出Token/次 |
| AutoManual | 原作者释放手册、六类技能、Agent与Planner测试代码 | 原始5次重规划、2000输出Token/次、最多50个环境动作 |

AutoManual的对象标识作机械映射；六种任务类型精确命中已释放技能键，以精确键查找替代相同键的嵌入自匹配。没有增加模型。手册先前的学习成本与这次冻结产物评测成本分开。

在已经配置本仓库实验环境的机器上：

```bash
export AUTOHARNESS_EXPERIMENT_ROOT=/mnt/disk2/huangshengze
export COMPETITOR_RUN_ROOT=/mnt/disk2/huangshengze/competitors-20261102
python evaluation/competitors/fetch_sources.py --output "$COMPETITOR_RUN_ROOT"
python evaluation/competitors/prompt_eval.py react
python evaluation/competitors/prompt_eval.py reflact
python evaluation/competitors/automanual_eval.py
```

脚本复用实验根目录内`alfworld-final-headtohead-20261023/environment.py`、`test-tasks.json`与游戏数据；不自行重新划分测试集。模型与Tokenizer接口可通过`SOLVER_ENDPOINT`、`TOKENIZER_ENDPOINT`设置。依赖原生ALFWorld运行环境；源文件下载脚本另需`beautifulsoup4`。

每组输出`protocol.json`、逐题轨迹、`episodes.jsonl`、`summary.json`。统计严格成功率三遍均值、样本标准差、调用次数、输入输出Token及耗时。仅重试基础设施无效场次，保留有效失败；测试不回流优化器。

来源：[ReflAct原论文附录](https://arxiv.org/html/2505.15182#A11.SS1) · [AutoManual原作者代码](https://github.com/minghchen/automanual)。引文发现链与更多待适配方法见`results/research/citation-map.json`、`comparison-catalog.json`。


## 扩展到近期论文和其他场景

Harness-R1（2026年8月）释放了跨ALFWorld、WebShop、DBBench的运行补丁。本批预先固定其`seed20260720/dbbench.json`，迁移到共同Qwen3-4B、300题三遍；复用原作者钩子编译、执行、DB状态更新和上下文构造，关闭内置Life-Harness启发式，不重新训练9B编辑模型。

```bash
python evaluation/competitors/r1_db_eval.py
```

WebShop另设`webshop-fixed-stage2-20261102`共同冻结环境，Life-Harness、ALIGN及我们的两个历史产物各200题三遍复测。该组与历史环境分开排名，见`results/research/expanded-competitor-evaluations.json`；完整组完成后生成`webshop-frozen-comparison.json`。

近期筛选依据与排除理由见`recent-paper-review.json`。SkillFM未释放模型权重；GEPA-Curator与Verify–Backtrack Loop尚需专用实现适配。仅命中相同Benchmark的执行模型训练论文不加入Harness进化主比较。
