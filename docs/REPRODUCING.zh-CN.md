# 复现方法

[完整英文说明与参数表](REPRODUCING.md)

主线有两个入口。L4先维护当前Agent能力与插件职责，再依据训练轨迹生成修改。A/B/C由控制器管理每轮，统一候选格式、修改权限、配对评测和采用规则。

| 实验 | 配置入口 |
|---|---|
| L4，40轮 | configs/l4 |
| 四场景A/B/C，40轮 | configs/abc |
| 同控制器的数据覆盖对照 | 每场景C-sol61-narrow |
| ALFWorld历史20轮高分搜索 | configs/artifacts/alfworld-sol61-20 |
| WebShop历史L5与续跑 | configs/artifacts/webshop-* |

~~~bash
python -m pip install -e evolution
dsh-evolve profiles
dsh-evolve init ./runs/db-c --profile abc/dbbench/C-sol61 --assets /data/dbbench
dsh-evolve setup ./runs/db-c/experiment.yaml
dsh-evolve run ./runs/db-c/experiment.yaml
~~~

Python 3.10–3.12适合完整环境，Node.js至少22.19。执行模型使用BENCH_BASE_URL，需要认证时设置BENCH_API_KEY。DBBench还需BENCH_CHAT_URL、BENCH_TOKENIZER_URL和MYSQL_PASSWORD。ALFWorld用ALFWORLD_DATA_ROOT，WebShop用WEBSHOP_URL，OSBench用DOCKER_HOST。

A/B/C每轮抽取最多8条失败和4条成功轨迹，一次调用生成理由和替换内容。父子同题同试次评测，训练指标严格上升、钩子输出有变化才晋升，有验证集时还要求验证不下降。40轮后封存，再测试所有晋升版。同一run命令可接续完成有效进度。

A改技能文本，B一次改一个独立组件，C允许任务内共享状态。前三场景使用6批×50题，OSBench使用80训练＋20验证。数据覆盖对照为2批×50与6批×50，OSBench为等量换题。

WebShop按平均奖励晋升，以严格购买成功率报告。商品快照和起始插件需要一致。仓库提供题单和起始插件，大型数据库、游戏文件、镜像与冻结商品快照需另行准备；复测原报告环境需从实验维护者取得对应商品快照。

用init的--baseline选项载入冻结产物，完成环境设置后，执行dsh-evolve test-artifact CONFIG。Telecom沿用integrations/telecom的双角色环境、GLM用户及产物协议。

安装检查为python evolution/scripts/smoke.py /tmp/dsh-install-check，使用真实DSH钩子和模拟任务，覆盖L4、A、B、C的采用、保留、封存和测试。本次已跑通，不消耗模型额度；完整Benchmark采用已有实测结果。
