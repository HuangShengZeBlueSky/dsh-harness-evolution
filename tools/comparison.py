"""Bilingual, release-driven views of published artifacts and paper baselines."""
import json
import history
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from matplotlib.font_manager import FontProperties

NAMES={'alfworld':'ALFWorld','dbbench':'DBBench','webshop':'WebShop','osbench':'OSBench','telecom':'τ²-Telecom'}
PURPOSE_ZH={'alfworld':'家务任务流程与可见状态指导','dbbench':'数据库结构与取值对齐、SQL 执行和结果提交','webshop':'商品检索、规格选择、价格核验与购买','osbench':'文件检查、命令语义、全局统计与重复恢复','telecom':'客户线路身份、设备诊断、账单与账户复核'}
def pct(v):return '—' if v is None else f'{v*100:.2f}%'
def release_label(r,zh=False):
 return ('回溯补测' if zh else 'Retrospective') if r.get('selection_kind')=='retrospective_adopted' else ('训练最终版' if zh else 'Training final')
def group_label(root,r,zh=False):
 primary=json.loads((root/'results/leaderboard-policy.json').read_text())['primary_groups']
 return ('主榜组' if zh else 'Primary') if primary[r['benchmark']]==r['comparison_group'] else r['comparison_group']
def count(root,r):return len(json.loads((root/r['artifact']/'composition.json').read_text())['methods'])
def matrix(winners,catalog,zh=False):
 labels=['裸模型' if zh else 'Bare']+[m['label'] for m in catalog['methods'][1:]]+['我们' if zh else 'Ours']
 lines=['| '+('场景' if zh else 'Benchmark')+' | '+' | '.join(labels)+' |','|'+'---|'*(len(labels)+1)]
 for d,r in winners.items():lines.append('| '+NAMES[d]+' | '+' | '.join([pct(m['pass_at_1'][d]) for m in catalog['methods']]+['**'+pct(r['metrics']['pass_at_1'])+'**'])+' |')
 return lines

def overview(root,winners,catalog,zh=False):
 font=None
 if zh:
  for p in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','/System/Library/Fonts/STHeiti Medium.ttc']:
   if Path(p).exists():font=FontProperties(fname=p);break
  if font is None:raise RuntimeError('Install fonts-noto-cjk to render the Chinese leaderboard.')
 fig=plt.figure(figsize=(14.5,7.4),dpi=160);ax=fig.add_axes([0,0,1,1]);ax.set_xlim(0,1450);ax.set_ylim(740,0);ax.axis('off');fig.patch.set_facecolor('#f2f5fa')
 def text(x,y,s,**kw):ax.text(x,y,s,fontproperties=font,va='center',**kw)
 ax.add_patch(FancyBboxPatch((20,20),1410,700,boxstyle='round,pad=0,rounding_size=18',facecolor='white',edgecolor='#e2e8f0'))
 ax.add_patch(FancyBboxPatch((20,20),1410,137,boxstyle='round,pad=0,rounding_size=18',facecolor='#101e35',edgecolor='none'));ax.add_patch(plt.Rectangle((20,125),1410,32,color='#101e35',linewidth=0))
 text(52,56,'DSH  /  HARNESS EVOLUTION',color='#75d8c6',fontsize=12,fontweight='bold')
 text(52,96,'五个场景，多方法对照，可直接使用的插件产物' if zh else 'Five benchmarks. A broader method comparison.',color='white',fontsize=24,fontweight='bold')
 text(52,132,'同一做题模型系列：Qwen3-4B  ·  指标：成功率  ·  论文报告与我们的实测分别标注' if zh else 'Qwen3-4B actor family  ·  Success rate  ·  Paper-reported references and our measured artifacts',color='#b8c7dc',fontsize=11)
 text(1390,56,('发布：' if zh else 'PUBLISHED  ')+max(r['published_on'] for r in winners.values()),color='#b8c7dc',fontsize=10,ha='right')
 xs=[380,545,710,875,1040,1205,1365];labels=['裸模型' if zh else 'Bare','ALIGN','AgentSquare','Meta-Harness','AHE','Life-Harness','我们' if zh else 'Ours']
 text(52,188,'产物 / 检查点' if zh else 'ARTIFACT / CHECKPOINT',fontsize=11,color='#69778c',fontweight='bold')
 for x,label in zip(xs,labels):
  text(x,181,label,ha='center',fontsize=11,color='#0c7968' if label==labels[-1] else '#344967',fontweight='bold')
  text(x,203,('本地实测' if zh else 'LOCAL TEST') if label==labels[-1] else ('论文 v3' if zh else 'PAPER v3') if label=='Life-Harness' else ('论文报告' if zh else 'PAPER'),ha='center',fontsize=8,color='#8792a3')
 for i,(d,r) in enumerate(winners.items()):
  y=222+i*78
  if i%2==0:ax.add_patch(FancyBboxPatch((36,y),1378,72,boxstyle='round,pad=0,rounding_size=10',facecolor='#f5f7fb',edgecolor='none'))
  ax.add_patch(FancyBboxPatch((1294,y+4),121,64,boxstyle='round,pad=0,rounding_size=8',facecolor='#e3f5ef',edgecolor='none'))
  text(52,y+23,NAMES[d],fontsize=16,color='#152942',fontweight='bold')
  text(52,y+51,f"{r['checkpoint']} · {release_label(r,zh)}",fontsize=10,color='#66768b')
  values=[m['pass_at_1'][d] for m in catalog['methods']]+[r['metrics']['pass_at_1']]
  for j,(x,value) in enumerate(zip(xs,values)):
   text(x,y+34,'—' if value is None else f'{value*100:.2f}',ha='center',fontsize=19 if j==6 else 16,fontweight='bold' if j==6 else 'normal',color='#0c7968' if j==6 else '#a3acb9' if value is None else '#344967')
   if d=='telecom' and j==5:
    old=history.data(root)[0]['metrics']['pass_at_1']
    text(x,y+58,f'v1/v2: {old*100:.2f}',ha='center',fontsize=8,color='#66768b')
 text(52,639,'数值单位：%  ·  — 表示论文未报告该场景  ·  每个产物均附源码、框图和进化曲线' if zh else 'All values in %  ·  — = not reported for this setting  ·  Source, architecture and evolution curve included',fontsize=10,color='#53657b')
 text(52,671,'对照来源：Life-Harness 论文表 1、10、11；其作者报告的其他方法结果，并非我们的复测。' if zh else 'References: Life-Harness Tables 1, 10 and 11. Other-method results are reported by that paper, not rerun by us.',fontsize=9,color='#778498')
 text(52,699,'轮数、优化模型、测试重复次数存在差异；ALIGN 划分不同；Telecom 用户模拟器及运行接口不同。' if zh else 'Evolution budgets and trials differ. ALIGN uses its own split. Telecom simulator and runtime-access protocols differ.',fontsize=9,color='#778498')
 fig.savefig(root/'assets'/('leaderboard.zh-CN.png' if zh else 'leaderboard.png'),dpi=160,facecolor=fig.get_facecolor());plt.close(fig)

def leaderboard(root,winners,rows,catalog,refs,local,finals,zh=False):
 lines=['# '+('已发布 Harness 多方法榜单' if zh else 'Published harnesses · multi-method leaderboard'),'','[English](LEADERBOARD.md) | [简体中文](LEADERBOARD.zh-CN.md)','',f"![{'多方法榜单' if zh else 'Multi-method leaderboard'}](assets/leaderboard{'.zh-CN' if zh else ''}.png)",'']
 lines+=matrix(winners,catalog,zh)
 lines+=['',('主表“我们”展示已发布、已晋升检查点的完整测试最高值，可能来自回溯补测。训练最终选定版单独保留如下；回溯高分不是新的独立盲测。' if zh else 'The Ours column shows the highest complete test score among published promoted checkpoints, including retrospective releases. Training-selected final artifacts remain separate below; a retrospective high score is not a fresh independent test.'),'',
 '## '+('训练最终版与最佳已测晋升点' if zh else 'Training-final artifacts versus best measured promoted checkpoints'),'','| '+('场景 | 训练最终版最高 | 最佳已测晋升点 | 发布依据 |' if zh else 'Benchmark | Best training-final artifact | Best measured promoted checkpoint | Release basis |'),'|---|---|---|---|']
 for d,r in winners.items():
  f=finals[d];lines.append(f"| {NAMES[d]} | [{f['checkpoint']} · {pct(f['metrics']['pass_at_1'])}]({f['artifact']}) | [{r['checkpoint']} · {pct(r['metrics']['pass_at_1'])}]({r['artifact']}) | {release_label(r,zh)} |")
 lines+=['',('**来源与口径：**其他方法数值由 Life-Harness 作者在论文中报告，并非我们的复测。Meta-Harness、AHE 来自表 1；裸模型、Life-Harness 使用表 10；ALIGN、AgentSquare 来自表 11。保留原文精度；缺失值不是零。' if zh else '**Provenance:** other-method scores are reported by the Life-Harness authors, not measured by us. Meta-Harness/AHE: Table 1; bare/Life-Harness: Table 10; ALIGN/AgentSquare: Table 11. Published precision is retained; missing is not zero.'),'',
 ('论文 Meta-Harness、AHE、Life-Harness 均采用 GPT-5.5 优化六轮；我们的优化器与轮数不同。论文 AgentBench 每题一次，我们每题三次。ALIGN 使用其发布划分。Telecom 还存在用户模拟器、账户事实接口与额外复核调用的差异，因此不将这些数值合成一个严格公平排名。' if zh else 'The paper evolves Meta-Harness, AHE and Life-Harness for six rounds with GPT-5.5. Our optimizer and budgets differ. Paper AgentBench uses one trial; ours uses three. ALIGN uses its released split. Telecom also differs in user simulator, account-facts access and auxiliary review. The table is a reference comparison, not a controlled overall ranking.'),'',
 '## '+('每种方法做什么' if zh else 'What each method does'),'','| '+('方法 | 简明思路 |' if zh else 'Method | Approach |'),'|---|---|']
 for m in catalog['methods']:lines.append('| '+('裸模型' if zh and m['id']=='bare' else 'Bare' if m['id']=='bare' else m['label'])+' | '+m['description_zh' if zh else 'description_en']+' |')
 lines+=['| '+('我们 | 基于 DSH 的插件进化：先维护当前能力结构，再针对问题类设计插件并评测采用。' if zh else 'Ours | Evolve DSH plugins after mapping current capabilities; assign problem-class responsibilities and evaluate adoption.')+' |','',
 '## '+('Telecom 稳定性与 WebShop 平均奖励' if zh else 'Telecom reliability and WebShop mean reward'),'','| '+('指标' if zh else 'Metric')+' | Bare | Meta-Harness | AHE | Life-Harness | '+('我们' if zh else 'Ours')+' |','|---|---:|---:|---:|---:|---:|']
 selected=[m for m in catalog['methods'] if m['id'] in ['bare','meta','ahe','life']]
 for field,label in [('pass_at_3','Pass@3 · 至少一次成功' if zh else 'Pass@3 · at least one success'),('pass_cubed','Pass³ · 三次全成功' if zh else 'Pass³ · all three succeed')]:
  lines.append('| '+label+' | '+' | '.join([pct(m['telecom_'+field]) for m in selected]+[pct(winners['telecom']['metrics'][field])])+' |')
 lines+=['',('WebShop 当前产物平均奖励为 **' if zh else 'Current WebShop mean reward is **')+f"{winners['webshop']['metrics']['mean_reward']*100:.2f}/100**"+('；主榜使用严格成功率，两者不混排。' if zh else '; the main table ranks strict success, not partial reward.'),'',
 '## '+('演化成本：百万 token' if zh else 'Evolution cost · million tokens'),'','| '+('场景' if zh else 'Benchmark')+' | Meta-Harness | AHE | Life-Harness | '+('我们' if zh else 'Ours')+' |','|---|---:|---:|---:|---:|']
 cost_methods=[m for m in catalog['methods'] if m['id'] in ['meta','ahe','life']]
 for d,r in winners.items():lines.append('| '+NAMES[d]+' | '+' | '.join([f"{m['evolution_tokens'][d]/1e6:g}" for m in cost_methods]+[('未汇总' if zh else 'Not consolidated') if r['evolution_tokens'] is None else f"{r['evolution_tokens']/1e6:g}"])+' |')
 lines+=['',('论文成本为表 1 的取整值；我们的成本缺失不等于零，不据此声称更省。ALIGN 和 AgentSquare 未在该表报告演化成本。' if zh else 'Paper costs are rounded values from Table 1. Missing local cost is not zero; no efficiency advantage is claimed. ALIGN/AgentSquare evolution costs are not reported in that table.'),'',
 '## '+('本地复测水位' if zh else 'Local measured waterlines'),'','| '+('场景 | 本地裸模型 | 本地 Life-Harness full | 当前产物 |' if zh else 'Benchmark | Local bare | Local Life-Harness full | Current artifact |'),'|---|---:|---:|---:|']
 for d,r in winners.items():
  l=local[d];lines.append(f"| {NAMES[d]} | {pct(l['baseline_strict'] if d=='webshop' else l['baseline'])} | {pct(l['full'])} | {pct(r['metrics']['pass_at_1'])} |")
 lines+=['','## '+('全部已发布产物' if zh else 'All published artifacts'),'','| '+('场景 | 产物 | 成功率 | 比较组 | 发布日期 |' if zh else 'Benchmark | Artifact | Success | Comparison | Published |'),'|---|---|---:|---|---|']
 for r in sorted(rows,key=lambda r:(r['benchmark'],-r['metrics']['pass_at_1'])):lines.append(f"| {NAMES[r['benchmark']]} | [{r['release_id']}]({r['artifact']}{'/README.zh-CN.md' if zh else ''}) | {pct(r['metrics']['pass_at_1'])} | {group_label(root,r,zh)} · {release_label(r,zh)} | {r['published_on']} |")
 lines+=['',('[论文原文与数值来源]' if zh else '[Paper and numerical sources]')+'('+catalog['source_url']+') · '+('[结构化对照数据]' if zh else '[Structured comparison data]')+'(results/paper-baselines.json) · [English protocol notes](docs/METRICS.md)','']
 lines+=['',('主榜只在已登记的同组评测条件内选最高分；不同模型或协议的产物保留在版本表，不自动替换主榜。' if zh else 'Primary champions are selected only within registered comparison groups. Other actors/protocols remain in the release table without automatically replacing the primary champion.'),'']
 (root/('LEADERBOARD.zh-CN.md' if zh else 'LEADERBOARD.md')).write_text('\n'.join(lines))

def chinese_readme(root,winners):
 lines=['# DSH Harness Evolution','','[English](README.md) | **简体中文**','','**五个场景，多种方法对照，可直接查看的插件产物。**','','基于 DSH 的 harness 进化，固定 Qwen3-4B 做题模型。每个产物包含插件源码、运行接口、Mermaid 框图、真实进化曲线和测试配置。','','[**完整榜单**](LEADERBOARD.zh-CN.md) · [**进化曲线**](docs/CURVES.zh-CN.md) · [**方法概览**](docs/METHOD.zh-CN.md) · [**下载全部产物**](https://github.com/HuangShengZeBlueSky/dsh-harness-evolution/archive/refs/heads/main.zip)','','![多方法成绩总览](assets/leaderboard.zh-CN.png)','','榜单包含裸模型、ALIGN、AgentSquare、Meta-Harness、AHE、Life-Harness 和我们。我们的主列展示最佳已测晋升点，可能来自回溯补测；训练最终版另列。其他方法使用论文报告值；缺失的场景留空。','','## 选择 Harness 产物','','| 场景与成绩 | 解决的问题 | 检查点 | 直接查看 |','|---|---|---|---|']
 for d,r in winners.items():
  a=r['artifact'];lines.append(f"| **{NAMES[d]} · {pct(r['metrics']['pass_at_1'])}** | {PURPOSE_ZH[d]} | [{r['checkpoint']} · {release_label(r,True)}]({a}/README.zh-CN.md) | [源码]({a}/plugins) · [框图]({a}/README.zh-CN.md#结构框图) · [曲线]({a}/README.zh-CN.md#进化曲线) |")
 lines+=['','WebShop 按严格成功率排序，平均奖励单独展示。插件注册数量不代表独立证明有效的机制数量。','', '## 方法概览','','先维护当前 Agent 的能力和插件职责，再从训练失败中找问题类，提出插件改动，通过实际评测决定采用。允许插件协作，也允许删除重复或有副作用的指导。这里只公开方法概览和产物，不展开尚未公开的论文细节。','','```mermaid','flowchart LR','    A[训练失败] --> B[当前能力与插件职责]','    B --> C[问题类与插件机制]','    C --> D[开发集评测]','    D -->|采用或修订| B','    D -->|预算结束| E[冻结检查点]','    E --> F[最终测试并发布]','```','','## 后续如何更新','','**新 harness＋测试数据＋进化曲线 → 发布新版本 → 自动更新中英文榜单。**','','使用 `tools/publish.py` 添加产物；推送后 GitHub Actions 自动生成中英文首页总览、榜单和产物页，旧版本保留。提供新的产物和实测数据即可更新，不需要公开内部实验日志。[发布说明](docs/PUBLISHING.zh-CN.md) · [运行说明](docs/RUNNING.zh-CN.md)','','## 如何理解比较','','论文采用的优化模型、六轮预算和测试重复次数与我们不同；ALIGN 使用自身发布划分；Telecom 还存在用户模拟器、账户事实接口与额外复核调用的差异。主榜是来源明确的数值对照，不把所有结果包装成严格同协议排名。原始测试成绩沿用已完成实验，本次发布不代表重新跑完评测。','','[MIT 许可证](LICENSE) · [致谢与第三方声明](docs/THIRD_PARTY.md)','']
 (root/'README.zh-CN.md').write_text('\n'.join(lines))

def artifact_zh(root,r):
 a=root/r['artifact'];diagram=(a/'diagram.mmd').read_text();p=r['protocol'];card=json.loads((a/'card.json').read_text());method=(a/'method.zh-CN.mmd').read_text()
 basis='回溯补测选出的已晋升检查点；原实验训练选定最终版为 '+r['campaign_final_checkpoint'] if r.get('selection_kind')=='retrospective_adopted' else '训练选定的最终检查点'
 text=f"""# {NAMES[r['benchmark']]} · {r['checkpoint']}

[English](README.md) | **简体中文**

**产物说明：**{card.get('summary_zh',PURPOSE_ZH[r['benchmark']])}

**发布依据：**{basis}。

| 测试成功率 | 本次发布检查点 | 插件注册项 | 测试覆盖 |
|---:|---|---:|---|
| **{pct(r['metrics']['pass_at_1'])}** | {r['checkpoint']} / {r['rounds']} 轮预算 | {count(root,r)} | {r['coverage']['tasks']} 题 × {r['coverage']['repeats']} 遍 |

做题模型：**{p['actor']}**；优化模型：**{r['optimizer']}**；方法：**{r['method']}**。

[**插件源码**](plugins) · [**运行配置**](protocol.json) · [**插件装配**](composition.json) · [**全部产物**](../../../README.zh-CN.md)

## 方法流程图

```mermaid
{method.strip()}
```

## 结构框图

下图展示运行时结构和插件职责；模块名保留源码英文名称，便于对应实现。

```mermaid
{diagram.strip()}
```

## 进化曲线

![真实记录的进化曲线](evolution.png)

上图为候选训练成绩和已采用版本的验证成绩；下图仅显示实际测过的测试点。训练批次可能轮换，曲线上下波动不等于固定测试集能力下降。WebShop L5 展示严格成功率；原方法协同续跑按平均奖励晋升，开发曲线保留平均奖励。测试排名统一看严格成功率。菱形标记采用记录，竖线标记发布检查点。灰线是论文各方法在该场景报告的最高数值，只作参考。

[曲线数据](curve.json) · [完整插件职责表](README.md#plugin-inventory) · [多方法榜单](../../../LEADERBOARD.zh-CN.md)

## 使用产物

在仓库根目录安装依赖后启动：

```bash
npm install
MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs {r['artifact']}
```

该命令启动 harness 运行时。基准环境、任务数据和做题模型服务另行提供。[运行说明](../../../docs/RUNNING.zh-CN.md)

## 评测口径

成绩来自原实验的完整有效测试，不是发布后重新评测。发布依据已在页首明确标注；回溯补测发现的候选不会改写原实验最终选择，也不是新的独立盲测。插件数量是实现登记数，不代表每个插件都已单独证明有收益。
"""
 if r['benchmark']=='telecom':text+='\nTelecom 使用 GLM-5.3-Flash 用户模拟器，并包含账户事实适配与额外复核调用；与论文对照存在协议差异。30 个继承表面组件加 5 个定制插件，不等于 35 类独立创新机制。\n'
 if r['benchmark']=='telecom':text+='\n**为什么发布 v06 而不是历史测试峰值？**v05 历史测试为 87.50%，但训练选定的最终版是 v06（84.17%）。这里保留实验最终选择，不用测试峰值倒选替代。八个新增候选为 v03 至 v10，起点为 v02。\n'
 (a/'README.zh-CN.md').write_text(text)
 en=a/'README.md';s=en.read_text();s=s.replace('\n\n','\n\n**English** | [简体中文](README.zh-CN.md)\n\n',1);en.write_text(s)

def latest_releases(root,rows,zh=False):
 import re
 latest=max(r['published_on'] for r in rows);new=[r for r in rows if r['published_on']==latest]
 lines=['## '+('最新发布' if zh else 'Latest releases')+' · '+latest,'','| '+('场景 | 产物 / 成功率 | 发布依据 | 直接查看 |' if zh else 'Benchmark | Artifact / success | Release basis | Explore |'),'|---|---|---|---|']
 for r in sorted(new,key=lambda r:(r['benchmark']!='webshop',r['benchmark'])):
  a=r['artifact'];page=a+('/README.zh-CN.md' if zh else '')
  links=f'[方法流程]({page}#方法流程图) · [Harness框图]({page}#结构框图) · [曲线]({page}#进化曲线)' if zh else f'[Method]({page}#method-flow) · [Harness]({page}#architecture) · [Curve]({page}#evolution)'
  lines.append(f"| {NAMES[r['benchmark']]} | [{r['checkpoint']} · **{pct(r['metrics']['pass_at_1'])}**]({page}) | {release_label(r,zh)} | {links} |")
 path=root/('README.zh-CN.md' if zh else 'README.md');text=path.read_text();text=re.sub(r'<!-- LATEST:START -->.*?<!-- LATEST:END -->\n*','',text,flags=re.S)
 content='<!-- LATEST:START -->\n\n'+'\n'.join(lines)+'\n\n<!-- LATEST:END -->\n\n'
 text=text.replace('<!-- TELECOM-HISTORY:START -->',content+'<!-- TELECOM-HISTORY:START -->',1);path.write_text(text)

def render(root,winners,rows,refs,local,finals):
 catalog=json.loads((root/'results/paper-baselines.json').read_text())
 for zh in [False,True]:overview(root,winners,catalog,zh);leaderboard(root,winners,rows,catalog,refs,local,finals,zh)
 chinese_readme(root,winners)
 history.render(root,winners['telecom'])
 for r in rows:artifact_zh(root,r)
 for zh in [False,True]:latest_releases(root,rows,zh)
 curves=['# 进化曲线','','[English](CURVES.md) | **简体中文**','','只展示真实记录的开发成绩与测试点；未测检查点不补画测试分数。','']
 for d,r in winners.items():curves += [f'## {NAMES[d]}','',f"[检查点 {r['checkpoint']}：源码与框图](../{r['artifact']}/README.zh-CN.md)",'',f"![{NAMES[d]} 进化曲线](../{r['artifact']}/evolution.png)",'']
 (root/'docs/CURVES.zh-CN.md').write_text('\n'.join(curves))
