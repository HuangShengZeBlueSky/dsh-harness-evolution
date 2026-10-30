# DSH Harness Evolution

[English](README.md) | **简体中文**

**方法、进化曲线、可复现配置与真实插件产物。**

固定做题模型，进化运行时 Harness。我们公开每种循环改了什么、怎样采用候选、结果如何，以及代码目前能复现到哪一层。

[**交互式摘要与全部曲线**](https://huangshengzebluesky.github.io/dsh-harness-evolution/) · [**方法**](docs/METHODS.zh-CN.md) · [**复现**](docs/REPRODUCING.zh-CN.md) · [**完整榜单**](LEADERBOARD.zh-CN.md)

## 五场景产物

| 场景 | 最佳已发布最终版 | 已发布回溯高点 | Life-Harness v3参考 |
|---|---:|---:|---:|
| ALFWorld | [95.41% · v18](harnesses/alfworld/20261026-method1-sol61-v18/README.zh-CN.md) | — | 88.07% |
| DBBench | [70.56% · v35](harnesses/dbbench/20261026-l4-h0-sol61-v35/README.zh-CN.md) | — | 65.00% |
| WebShop | [44.50% · v28](harnesses/webshop/20261026-l5-h0-sol61-v28/README.zh-CN.md) | [47.00% · v12](harnesses/webshop/20261027-original-best-sol61-v12) | 45.50% |
| OSBench | [38.89% · v17](harnesses/osbench/20261026-l4-h0-sol61-v17/README.zh-CN.md) | [39.35% · v03](harnesses/osbench/20261030-l4-h0-sol61-v03) | 39.60% |
| Telecom | [84.17% · v06](harnesses/telecom/20261026-start-luna-repaired-v06/README.zh-CN.md) | — | 90.00% |

这是不同方法及协议下的产物，不是一套统一算法的五场景成绩。最终版按各实验训练／验证规则选定；跨实验比较和回溯高点均已观察测试。论文预算、重复次数及 Telecom 用户／接口不同。主榜保留 ALIGN、AgentSquare、Meta-Harness、AHE 及 Life-Harness 历史版本。

## 这次审查留下的结论

- **改进并不单调。** L4／L5仍较强；L8传入了经验但未产生稳定收益，L9组件复用也未全面超过旧高点。
- **配置变化也是变量。** DB／Web的L4是300训练、无独立验证；L5是240训练＋60验证。不能把全部差距归因于一个新增模块。
- **选择规则仍有改进空间。** Web回溯47.00%高于该组最终44.33%；OS早期39.35%高于最终38.89%。保留原选择，不倒写历史。
- **总分提高与机制成立分别判断。** 已加载、已触发、已传入经验是执行事实；目标修复和整体收益是另外两层证据。

- **平均分与稳定性分开。** OS机制反馈平均成功32.87%高于摘要29.40%，三次全过25.00%却低于26.39%；单次搜索显示覆盖与稳定性没有同步改善。

![各方法最终测试](assets/method-final-tests.png)

## 从一份公共基础开始复现

`evolution/` 提供三场景 L1–L9 的共同运行代码、36份配置、任务编号与一个离线小例子。每种方法以“输入 → 改动 → 评测 → 采用 → 最终选择”说明；所有历史方法的可复现层级逐项标明。

```bash
python -m pip install -e evolution
dsh-evolve profiles
python evolution/scripts/smoke.py ./workspaces/smoke
```

该例子验证真实DSH运行钩子和一轮采用链，使用脚本模型，不是基准分数复测。正式运行另需模型、数据和环境；ALFWorld／Telecom及反馈扩展的接入边界见运行说明。

## 数据怎样读与更新

[逐轮记录与详细指标](results/research/README.md) · [统计口径](docs/METRICS.zh-CN.md) · [全部已发布产物](LEADERBOARD.zh-CN.md) · [发布指南](docs/PUBLISHING.zh-CN.md)

训练／验证／测试分开绘制，未测点不补线；每次重复、有效场数、采用与退步、模型和划分均可查看。时间注明计量范围，缺失成本不填零，三次测试不是三次独立搜索。新增实测记录后重新构建即可更新，网页显示采集日期，不冒充实时监控。

[MIT](LICENSE) · [Third-party notices](docs/THIRD_PARTY.md) · [DSH](https://github.com/deepseek-ai/deepseek-harness)
