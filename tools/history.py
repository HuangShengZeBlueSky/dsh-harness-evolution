"""Keep historical and current paper waterlines visible together."""
import json,re
from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch
from matplotlib.font_manager import FontProperties

def pct(value):return f'{value*100:.2f}%'
def data(root):return json.loads((root/'results/life-harness-telecom-history.json').read_text())['versions']

def figure(root,ours,zh):
 versions=data(root);old=versions[0];new=versions[-1];gain=(ours['metrics']['pass_at_1']-old['metrics']['pass_at_1'])*100
 font=None
 if zh:
  for p in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','/System/Library/Fonts/STHeiti Medium.ttc']:
   if Path(p).exists():font=FontProperties(fname=p);break
 fig=plt.figure(figsize=(12.8,4.4),dpi=160);ax=fig.add_axes([0,0,1,1]);ax.set_xlim(0,1280);ax.set_ylim(440,0);ax.axis('off');fig.patch.set_facecolor('#f2f5fa')
 def text(x,y,s,**kw):ax.text(x,y,s,fontproperties=font,va='center',**kw)
 text(35,35,'TELECOM / '+('历史版本对照' if zh else 'VERSIONED REFERENCES'),color='#526c88',fontsize=11,fontweight='bold')
 text(35,78,(f'比 v1 / v2 历史报告高 {gain:.2f} 个百分点' if zh else f'{gain:+.2f} pp above the v1 / v2 historical report'),color='#12364c',fontsize=23,fontweight='bold')
 text(35,112,'Qwen3-4B · 成功率数值对照；不是同协议因果提升' if zh else 'Qwen3-4B · Descriptive success-rate comparison, not a matched-protocol causal gain',color='#67788c',fontsize=10)
 entries=[('Life-Harness v1 / v2','2026-05-21 / 2026-05-27',old['metrics'],False),('我们的发布产物' if zh else 'Our released harness',ours['published_on'],ours['metrics'],True),('Life-Harness v3',new['published_on'],new['metrics'],False)]
 for i,(label,date,m,highlight) in enumerate(entries):
  x=25+i*420
  ax.add_patch(FancyBboxPatch((x,145),390,211,boxstyle='round,pad=0,rounding_size=14',facecolor='#e3f5ef' if highlight else 'white',edgecolor='#b5dfd1' if highlight else '#e0e6ee'))
  text(x+22,178,label,fontsize=16,color='#0c7968' if highlight else '#344967',fontweight='bold')
  text(x+22,205,date,fontsize=10,color='#778498')
  text(x+22,251,pct(m['pass_at_1']),fontsize=36,color='#0c7968' if highlight else '#344967',fontweight='bold')
  text(x+22,287,'Pass@1 · '+('单次成功率' if zh else 'success'),fontsize=11,color='#63758b')
  text(x+22,329,('三次全成功率 ' if zh else 'All-three success ')+pct(m['pass_cubed']),fontsize=13,color='#344967')
 text(35,386,'旧版与新版均保留。论文用户模型：DeepSeek-V4-Flash；我们：GLM-5.3-Flash，并含账户事实与额外复核。' if zh else 'Both paper versions remain visible. Paper user: DeepSeek-V4-Flash; ours: GLM-5.3-Flash, with account facts/review.',fontsize=9,color='#67788c')
 text(35,414,'来源：arXiv v1 表 7、v2 表 8、v3 表 10。日期指论文版本日期；不是同一产物的连续评测。' if zh else 'Sources: arXiv v1 Table 7, v2 Table 8, v3 Table 10. Dates identify paper versions, not one continuous evaluation.',fontsize=9,color='#778498')
 fig.savefig(root/'assets'/('telecom-history.zh-CN.png' if zh else 'telecom-history.png'),dpi=160,facecolor=fig.get_facecolor());plt.close(fig)

def section(root,ours,zh,full=True):
 versions=data(root);old=versions[0]['metrics'];m=ours['metrics'];gap1=(m['pass_at_1']-old['pass_at_1'])*100;gap3=(m['pass_cubed']-old['pass_cubed'])*100
 lines=['## '+('Telecom：历史水位与当前产物' if zh else 'Telecom: historical waterlines and our release'),'']
 lines += [f"![{'Telecom 新旧版本对照' if zh else 'Telecom historical and current references'}](assets/telecom-history{'.zh-CN' if zh else ''}.png)",'']
 if zh:lines += [f"**相对 v1/v2 的报告值，我们的成功率高 {gap1:.2f} 个百分点，三次全成功率高 {gap3:.2f} 个百分点。**新版 v3 仍并列展示；这是跨报告的数值差，不是同协议因果增益。",'']
 else:lines += [f"**Our Pass@1 is {gap1:.2f} pp higher than the v1/v2 report; all-three success is {gap3:.2f} pp higher.** The newer v3 result remains visible. These are cross-report numerical differences, not matched-protocol causal gains.",'']
 if full:
  lines += ['| '+('版本 / 产物 | 日期 | Pass@1 | Pass@3 至少一次 | Pass³ 三次全成功 |' if zh else 'Version / artifact | Date | Pass@1 | Pass@3 at least one | Pass³ all three |'),'|---|---|---:|---:|---:|']
  for v in versions:
   q=v['metrics'];lines.append(f"| [Life-Harness {v['version']}]({v['source_url']}) | {v['published_on']} | {pct(q['pass_at_1'])} | {pct(q['pass_at_3'])} | {pct(q['pass_cubed'])} |")
  lines += [f"| [{'我们' if zh else 'Ours'} · {ours['checkpoint']}]({ours['artifact']}{'/README.zh-CN.md' if zh else ''}) | {ours['published_on']} | **{pct(m['pass_at_1'])}** | **{pct(m['pass_at_3'])}** | **{pct(m['pass_cubed'])}** |",'']
 lines += [('来源：[v1 表 7](https://arxiv.org/html/2605.22166v1)、[v2 表 8](https://arxiv.org/html/2605.22166v2)、[v3 表 10](https://arxiv.org/html/2605.22166v3)。均取 Qwen3-4B 行，不混入 18 模型均值。旧新版论文均使用 DeepSeek-V4-Flash 用户模型；我们使用 GLM-5.3-Flash，另有账户事实与额外复核接口，不能直接归因于 loop。' if zh else 'Sources: [v1 Table 7](https://arxiv.org/html/2605.22166v1), [v2 Table 8](https://arxiv.org/html/2605.22166v2), [v3 Table 10](https://arxiv.org/html/2605.22166v3). These are Qwen3-4B rows, not the 18-model averages. Both old and new papers use DeepSeek-V4-Flash users; ours uses GLM-5.3-Flash plus account-facts/review integration. Differences cannot be attributed to the loop alone.'),'']
 return '\n'.join(lines)

def render(root,ours):
 for zh in [False,True]:
  figure(root,ours,zh)
  suffix='.zh-CN' if zh else ''
  for prefix,anchor,full in [('README','## 选择 Harness 产物' if zh else '## Choose a harness',False),('LEADERBOARD','## 每种方法做什么' if zh else '## What each method does',True)]:
   path=root/(prefix+suffix+'.md');text=path.read_text();text=re.sub(r'<!-- TELECOM-HISTORY:START -->.*?<!-- TELECOM-HISTORY:END -->\n*','',text,flags=re.S)
   content='<!-- TELECOM-HISTORY:START -->\n\n'+section(root,ours,zh,full)+'\n<!-- TELECOM-HISTORY:END -->\n\n'
   path.write_text(text.replace(anchor,content+anchor,1))
