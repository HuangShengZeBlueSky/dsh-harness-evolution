# 加载和使用 Harness

[English](RUNNING.md) | **简体中文**

需要 Node.js 22.19 以上，以及兼容 OpenAI 请求格式的 Qwen3-4B-Instruct-2507 模型服务。

```bash
npm install
node tools/check.mjs
MODEL_BASE_URL=http://localhost:8000/v1 \
  node tools/serve.mjs harnesses/dbbench/20261026-l4-h0-sol61-v35
```

默认监听 `127.0.0.1:8766`，可用 `PORT` 改端口；`HARNESS_STATE_DIR` 指定会话日志目录。四个 AgentBench 运行时支持 `MODEL_API_KEY`。历史 Telecom 运行时需要与其原始本地传输兼容的模型端点或代理。

**这一步启动 harness，不会自动跑完整基准。**数据库、操作系统任务镜像、ALFWorld 数据、WebShop 商品索引和 Telecom 用户模拟器另行准备。运行前查看产物的 `protocol.json`，保持模型、任务和预算一致。

## 环境与插件怎么配合

四个 AgentBench 产物通过原生 `benchmark/setup` 接口接入。环境负责任务状态、工具执行和评分，DSH 负责插件状态、提示组装和执行前后钩子。HTTP 接口为 `/health`、`/open`、`/advance`、`/result`、`/close`，精确请求字段见各产物 `lib/bridge.mjs`。

Telecom 使用独立的 `telecom/setup` 和复核桥接。其账户事实与 Python 适配源码在 `integrations/telecom`；需要匹配的 Tau2 扩展接口，不能直接宣称未经适配的上游环境可以复现成绩。复现时也要保留并计入额外复核调用。

## 仅更新榜单和图片

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
# Linux 首次需要中文字体；macOS 使用系统黑体
# sudo apt-get install fonts-noto-cjk
python tools/build.py
```

生成页面不调用模型，也不启动实验。当前分数来自原实验；插件可加载不等于已经重新完成基准评测。
