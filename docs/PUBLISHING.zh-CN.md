# 发布新 Harness

[English](PUBLISHING.md) | **简体中文**

交付 **产物目录＋测试结果＋进化曲线** 即可更新榜单，不需要公开内部日志。

1. 为新产物分配唯一 `release_id`，保留旧版本。
2. 目录包含插件代码、`composition.json`、`protocol.json`、`curve.json`、`diagram.mmd` 和 `card.json`。现有产物就是可用模板。
3. 参考 `results/<场景>--<版本>.json` 提供 JSON 或 YAML 结果。分数为 0 到 1；完整填写任务数、重复次数和有效场数。成本未汇总就填 `null`。
4. 选择 `results/leaderboard-policy.json` 中匹配的 `comparison_group`。如果做题模型、任务集、预算、环境或用户模拟器变了，新增比较组。新组会显示在版本表，但不会自动替换原协议的主榜产物。

```bash
# 先核对，不改文件
python tools/publish.py --artifact /path/to/harness --result /path/to/result.yaml --check

# 登记产物，生成中英文榜单和曲线
python tools/publish.py --artifact /path/to/harness --result /path/to/result.yaml
node tools/check.mjs

git add harnesses results assets README*.md LEADERBOARD*.md docs
git commit -m "Publish new harness and measured results"
git push
```

YAML 支持 `published_on: 2026-10-26` 这样的日期写法。发布前会核对：比较组配置一致、有效测试完整、最终检查点确实在曲线中、该点的测试成绩与发布分数一致。

推送才会公开；本地登记不会自动发送数据。GitHub Actions 同步生成中英文页面。纠正已发布成绩时用新的记录说明变化，不默默替换旧版。改变主榜的比较组属于显式的口径变更，需要同时更新榜单说明。
