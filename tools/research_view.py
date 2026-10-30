"""Build a human-readable, offline-capable research view from published records."""
from pathlib import Path
import json,re
import matplotlib.pyplot as plt

URL='https://github.com/HuangShengZeBlueSky/dsh-harness-evolution'
SITE='https://huangshengzebluesky.github.io/dsh-harness-evolution/'
NAMES={'alfworld':'ALFWorld','dbbench':'DBBench','webshop':'WebShop','osbench':'OSBench','telecom':'Telecom'}
def read(p):return json.loads(p.read_text())
def pct(x):return '—' if x is None else f'{x*100:.2f}%'
def method_id(g):
 if g.get('method_id'):return g['method_id']
 f=g.get('family','');m=g.get('method','');ident=g.get('id','')
 if f=='M1':return 'M1_cooperative'
 if f=='M2':return 'M2_free'
 if f.startswith('L8'):return f.replace('-','_')
 if f=='L4' and 'l4-best' in ident:return 'L4_seeded'
 if f in ['Resume','original-best']:return 'resume'
 if 'playbook' in ident:return 'playbook'
 if 'dsh-luna-h0-evolve' in ident:return 'luna20'
 if 'dsh-funnel-v1-v10' in ident:return 'astra_original'
 return f or m

def dataset(root):
 raw=read(root/'results/research/runs.json');hist=read(root/'results/research/historical-curves.json');methods=read(root/'results/research-methods.json');board=read(root/'results/leaderboard.json')
 historical={g['id']:g for g in hist['groups']};groups=[]
 for r in raw['runs']:
  h=historical.pop(r['id'],{});hp={p['version']:p for p in h.get('points',[])};points=[];champ=None
  for p in r['curve']:
   old=hp.get(p['version'],{});train=p.get('training') or {};val=p.get('validation')
   if isinstance(val,dict):val=val.get('mean')
   if p.get('champion_changed') and val is not None:champ=val
   q={**old,'round':p['round'],'version':p['version'],'parent':p.get('parent'),'after':train.get('mean'),'validation':val,'champion_validation':old.get('champion_validation',champ),'adopted':p.get('adopted'),'training_strict':p.get('training_strict',train.get('strict_pass_at_1')),'validation_strict':p.get('validation_strict'),'paired':p.get('paired'),'planned_target_repairs':p.get('planned_target_repairs'),'batch':p.get('batch')}
   points.append(q)
  if 'baseline' in hp:points.insert(0,hp['baseline'])
  final=r.get('final_selection') or {};test=r.get('final_test') or {};best=final.get('best')
  for p in points:
   if p['version']==best and test.get('strict_pass_at_1') is not None:
    key='strict_test' if r['benchmark']=='webshop' else 'test';p[key]=test['strict_pass_at_1'];p['final_test']=test['strict_pass_at_1']
  groups.append({'id':r['id'],'benchmark':r['benchmark'],'method_id':r['method_id'],'model':r['optimizer']['model'] if isinstance(r['optimizer'],dict) else r['optimizer'],'start':r.get('startpoint'),'rounds':r['decisions_completed'],'budget':r['candidate_budget'],'best':best or (h.get('best')),'status':r['status'],'collection':r['collection'],'points':points,'detail':r,'test':test.get('strict_pass_at_1')})
 for h in historical.values():
  groups.append({'id':h['id'],'benchmark':h['benchmark'],'method_id':method_id(h),'method_label':h.get('method'),'model':h.get('model'),'start':h.get('start'),'rounds':h.get('rounds'),'budget':h.get('budget'),'best':h.get('best'),'status':h.get('status'),'collection':'historical','complete':h.get('complete',False),'test_kind':h.get('test_kind'),'points':h.get('points',[]),'detail':None,'test':h.get('strict_test') if h['benchmark']=='webshop' else h.get('test')})
 artifacts=read(root/'research-artifacts/index.json')['artifacts'] if (root/'research-artifacts/index.json').exists() else []
 artifact_map={a['run_id']:'research-artifacts/'+a['artifact_path'] for a in artifacts}
 for g in groups:
  g['artifact']=artifact_map.get(g['id'])
  if g['method_id']=='L8-internal':g['method_id']='L8_internal'
  if g['method_id']=='L8-external':g['method_id']='L8_external'
 return {'updated':raw['collected_at'],'groups':groups,'methods':methods['methods'],'board':board,'paper':read(root/'results/paper-baselines.json')}

def final_matrix(root,data):
 rows=['L1','L2','L3','L4','L4_seeded','resume','L5','L6','L7','L8_internal','L8_external','L9'];domains=['dbbench','webshop','osbench'];matrix=[]
 for mid in rows:
  vals=[]
  for b in domains:
   match=[g for g in data['groups'] if g['method_id']==mid and g['benchmark']==b and g['budget']==40 and g['collection']=='mainline' and ('sol' in (g['model'] or '').lower())]
   vals.append(match[0]['test'] if match else None)
  matrix.append(vals)
 fig,ax=plt.subplots(figsize=(8.2,7));fig.patch.set_facecolor('#f6f8fc');ax.set_facecolor('#f6f8fc')
 arr=[[float('nan') if v is None else v*100 for v in r] for r in matrix];ax.imshow(arr,cmap='Blues',vmin=25,vmax=75,aspect='auto')
 ax.set_xticks(range(3),[NAMES[b] for b in domains]);ax.set_yticks(range(len(rows)),[r.replace('_',' ') for r in rows]);ax.tick_params(length=0,labelsize=10)
 for i,row in enumerate(matrix):
  for j,v in enumerate(row):ax.text(j,i,'—' if v is None else f'{v*100:.2f}',ha='center',va='center',color='white' if v and v>.58 else '#172b45',fontsize=12,fontweight='bold')
 for spine in ax.spines.values():spine.set_visible(False)
 ax.set_title('Final-selected tests / 40 rounds / Sol 6.1 high',loc='left',fontweight='bold',pad=20)
 fig.text(.02,.025,'Success, %; WebShop = strict purchase success. Splits and prior resources differ by method.',fontsize=9,color='#526177');fig.tight_layout(rect=[0,.05,1,1]);fig.savefig(root/'assets/method-final-tests.png',dpi=160);plt.close(fig)

def readmes(root,data):
 board=data['board'];finals=board['champions'];best=board['best_measured'];life=next(m for m in data['paper']['methods'] if m['id']=='life')
 for zh in [False,True]:
  suffix='.zh-CN' if zh else '';other='[English](README.md) | **简体中文**' if zh else '**English** | [简体中文](README.zh-CN.md)'
  lines=['# DSH Harness Evolution','',other,'', '**方法、进化曲线、可复现配置与真实插件产物。**' if zh else '**Methods, evolution curves, reproducible configurations, and measured plugin artifacts.**','',
   '固定做题模型，进化运行时 Harness。我们公开每种循环改了什么、怎样采用候选、结果如何，以及代码目前能复现到哪一层。' if zh else 'Freeze the actor and evolve its runtime harness. Inspect what each loop changes, how candidates are selected, what happened, and which reproduction steps are actually supported.','',
   f'[**交互式摘要与全部曲线**]({SITE}) · [**方法**](docs/METHODS.zh-CN.md) · [**复现**](docs/REPRODUCING.zh-CN.md) · [**完整榜单**](LEADERBOARD.zh-CN.md)' if zh else f'[**Interactive summary and all curves**]({SITE}?lang=en) · [**Methods**](docs/METHODS.md) · [**Reproduce**](docs/REPRODUCING.md) · [**Leaderboard**](LEADERBOARD.md)','',
   '## 五场景产物' if zh else '## Five benchmark artifacts','',
   '| 场景 | 最佳已发布最终版 | 已发布回溯高点 | Life-Harness v3参考 |' if zh else '| Benchmark | Best released final-selected artifact | Retrospective high point | Life-Harness v3 reference |','|---|---:|---:|---:|']
  for b in NAMES:
   f=finals[b];r=best[b];retro=r.get('selection_kind')=='retrospective_adopted';a=f['artifact']+('/README.zh-CN.md' if zh else '')
   lines.append(f"| {NAMES[b]} | [{pct(f['metrics']['pass_at_1'])} · {f['checkpoint']}]({a}) | "+(f"[{pct(r['metrics']['pass_at_1'])} · {r['checkpoint']}]({r['artifact']})" if retro else '—')+f" | {pct(life['pass_at_1'][b])} |")
  lines+=['', '这是不同方法及协议下的产物，不是一套统一算法的五场景成绩。最终版按各实验训练／验证规则选定；跨实验比较和回溯高点均已观察测试。论文预算、重复次数及 Telecom 用户／接口不同。主榜保留 ALIGN、AgentSquare、Meta-Harness、AHE 及 Life-Harness 历史版本。' if zh else 'These artifacts come from different methods and protocols, not one unified algorithm. Each final artifact follows its campaign selection rule; cross-campaign ranking and retrospective peaks use observed tests. Paper budgets, repeats, and Telecom simulator/access differ. The full leaderboard retains ALIGN, AgentSquare, Meta-Harness, AHE, and historical Life-Harness versions.','',
   '## 这次审查留下的结论' if zh else '## What the audit established','',
   '- **改进并不单调。** L4／L5仍较强；L8传入了经验但未产生稳定收益，L9组件复用也未全面超过旧高点。' if zh else '- **More loop machinery did not reliably improve results.** L4/L5 remain strong; L8 delivered experience without consistent gains, and L9 did not dominate the earlier checkpoints.',
   '- **配置变化也是变量。** DB／Web的L4是300训练、无独立验证；L5是240训练＋60验证。不能把全部差距归因于一个新增模块。' if zh else '- **Protocol changes are additional variables.** DB/Web L4 use 300 training tasks and no separate validation; L5 uses 240+60. Their score difference is not a clean component ablation.',
   '- **选择规则仍有改进空间。** Web回溯47.00%高于该组最终44.33%；OS早期39.35%高于最终38.89%。保留原选择，不倒写历史。' if zh else '- **Selection leaves headroom.** Web retrospective 47.00% exceeds that campaign final 44.33%; OS early 39.35% exceeds final 38.89%. Original selections are preserved.',
   '- **总分提高与机制成立分别判断。** 已加载、已触发、已传入经验是执行事实；目标修复和整体收益是另外两层证据。' if zh else '- **Overall gain and mechanism support are separate.** Loading, triggering, and experience delivery are execution facts; intended repairs and global outcome changes require additional evidence.','',
   '- **平均分与稳定性分开。** OS机制反馈平均成功32.87%高于摘要29.40%，三次全过25.00%却低于26.39%；单次搜索显示覆盖与稳定性没有同步改善。' if zh else '- **Mean success and reliability can diverge.** OS mechanism feedback reached 32.87% versus summary 29.40%, yet all-three success was 25.00% versus 26.39%. This is a single-search observation.','',
   '![各方法最终测试](assets/method-final-tests.png)' if zh else '![Final tests by method](assets/method-final-tests.png)','',
   '## 从一份公共基础开始复现' if zh else '## Reproduce from a shared core','',
   '`evolution/` 提供三场景 L1–L9 的共同运行代码、36份配置、任务编号与一个离线小例子。每种方法以“输入 → 改动 → 评测 → 采用 → 最终选择”说明；所有历史方法的可复现层级逐项标明。' if zh else '`evolution/` supplies shared three-benchmark L1–L9 code, 36 profiles, task IDs and a small offline example. Each method documents inputs → edits → evaluation → adoption → final selection, with explicit reproduction coverage.','',
   '```bash','python -m pip install -e evolution','dsh-evolve profiles','python evolution/scripts/smoke.py ./workspaces/smoke','```','',
   '该例子验证真实DSH运行钩子和一轮采用链，使用脚本模型，不是基准分数复测。正式运行另需模型、数据和环境；ALFWorld／Telecom及反馈扩展的接入边界见运行说明。' if zh else 'This scripted-model example exercises real DSH hooks and one adoption cycle; it does not remeasure benchmark scores. Formal runs require models, data and environments. ALFWorld/Telecom and feedback-extension integration boundaries are documented.','',
   '## 数据怎样读与更新' if zh else '## Read and update the data','',
   f'[逐轮记录与详细指标](results/research/README.md) · [统计口径](docs/METRICS.zh-CN.md) · [全部已发布产物](LEADERBOARD.zh-CN.md) · [发布指南](docs/PUBLISHING.zh-CN.md)' if zh else '[Round records and detailed statistics](results/research/README.md) · [Metric definitions](docs/METRICS.md) · [All artifacts](LEADERBOARD.md) · [Publishing](docs/PUBLISHING.md)','',
   '训练／验证／测试分开绘制，未测点不补线；每次重复、有效场数、采用与退步、模型和划分均可查看。时间注明计量范围，缺失成本不填零，三次测试不是三次独立搜索。新增实测记录后重新构建即可更新，网页显示采集日期，不冒充实时监控。' if zh else 'Training, validation and test measurements remain separate. Inspect repeats, valid coverage, adoption/regression, models and splits. Time fields state their scope; missing costs stay null; three test trials are not three independent searches. New measured records rebuild the site, which shows a collection date rather than pretending to be a live monitor.','',
   '[MIT](LICENSE) · [Third-party notices](docs/THIRD_PARTY.md) · [DSH](https://github.com/deepseek-ai/deepseek-harness)','']
  (root/('README'+suffix+'.md')).write_text('\n'.join(lines))

def build(root):
 if not (root/'results/research-methods.json').exists():return
 data=dataset(root);final_matrix(root,data);readmes(root,data)
 text=(root/'tools/research-template.html').read_text();payload=json.dumps(data,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
 out=root/'site';out.mkdir(exist_ok=True);(out/'index.html').write_text(text.replace('__RESEARCH_DATA__',payload));(out/'.nojekyll').write_text('')
 for zh in [False,True]:
  p=root/('docs/CURVES.zh-CN.md' if zh else 'docs/CURVES.md');s=p.read_text();idx=s.index('\n\n');s=s[:idx]+('\n\n[**按方法、模型和场景查看全部进化曲线**]('+SITE+')。开发分数、原最终测试与回溯补测单独显示；可导出当前曲线。' if zh else '\n\n[**Explore every method, model and benchmark curve**]('+SITE+'?lang=en). Development, original final tests and retrospective measurements remain distinct; export the selected curve.')+s[idx:];p.write_text(s)
 print(f'Research view: {len(data["groups"])} recorded campaigns, {len(data["methods"])} method definitions.')
