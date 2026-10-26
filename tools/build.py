"""Render public results and actual recorded curves. Never run an experiment."""
from pathlib import Path
import json, re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

ROOT=Path(__file__).resolve().parents[1]
NAMES={'alfworld':'ALFWorld','dbbench':'DBBench','webshop':'WebShop','osbench':'OSBench','telecom':'τ²-Telecom'}
PURPOSES={
 'alfworld':'Household procedures + visible-state guidance',
 'dbbench':'SQL grounding, execution, recovery and submission',
 'webshop':'Search, product options and budget-aware checkout',
 'osbench':'File inspection, shell-task contracts and recovery',
 'telecom':'Customer identity, device diagnosis and account review',
}
ROUTES={'alfworld':'Free plugin evolution','dbbench':'L4 · Agent capability map','webshop':'L5 · Strict-success objective','osbench':'L4 · Agent capability map','telecom':'Repaired-start continuation'}
def pct(v):return '—' if v is None else f'{100*v:.2f}%'
def score(v):return '—' if v is None else f'{100*v:.2f}'
def count_modules(r):return len(json.loads((ROOT/r['artifact']/'composition.json').read_text())['methods'])

def overview(winners,refs):
 """A single readable GitHub-native scoreboard, generated from release records."""
 (ROOT/'assets').mkdir(exist_ok=True)
 fig=plt.figure(figsize=(13.2,7.4),dpi=160);ax=fig.add_axes([0,0,1,1]);ax.set_xlim(0,1320);ax.set_ylim(740,0);ax.axis('off')
 fig.patch.set_facecolor('#f2f5fa')
 ax.add_patch(FancyBboxPatch((20,20),1280,700,boxstyle='round,pad=0,rounding_size=18',facecolor='white',edgecolor='#e2e8f0'))
 ax.add_patch(FancyBboxPatch((20,20),1280,137,boxstyle='round,pad=0,rounding_size=18',facecolor='#101e35',edgecolor='none'))
 ax.add_patch(plt.Rectangle((20,126),1280,31,color='#101e35',linewidth=0))
 ax.text(52,57,'DSH  /  HARNESS EVOLUTION',color='#75d8c6',fontsize=12,fontweight='bold',va='center')
 ax.text(52,98,'Five benchmarks. Released, working harnesses.',color='white',fontsize=23,fontweight='bold',va='center')
 ax.text(52,132,'Frozen Qwen3-4B actor  ·  Native DSH plugins  ·  Versioned artifacts and measured curves',color='#b8c7dc',fontsize=11,va='center')
 latest=max(r['published_on'] for r in winners.values())
 ax.text(1264,56,'PUBLISHED  '+latest,color='#b8c7dc',fontsize=10,ha='right',va='center')
 for x,label,align in [(52,'HARNESS / SELECTED CHECKPOINT','left'),(443,'SUCCESS  ·  0–100%','left'),(894,'OUR TEST','right'),(1053,'LIFE-HARNESS','right'),(1259,'NUMERICAL GAP','right')]:
  ax.text(x,187,label,color='#69778c',fontsize=10,fontweight='bold',ha=align,va='center')
 for i,(domain,r) in enumerate(winners.items()):
  y=213+i*85;ours=r['metrics']['pass_at_1']*100;paper=refs[domain]['full']*100;gap=ours-paper
  if i%2==0:ax.add_patch(FancyBboxPatch((36,y),1248,78,boxstyle='round,pad=0,rounding_size=10',facecolor='#f5f7fb',edgecolor='none'))
  ax.text(52,y+22,NAMES[domain],fontsize=16,color='#152942',fontweight='bold',va='center')
  ax.text(52,y+53,f"{r['checkpoint']}  ·  {count_modules(r)} registrations  ·  {r['rounds']} rounds",fontsize=10,color='#66768b',va='center')
  x=443;width=310;cy=y+33
  ax.add_patch(FancyBboxPatch((x,cy-5),width,10,boxstyle='round,pad=0,rounding_size=5',facecolor='#e5ebf3',edgecolor='none'))
  ax.add_patch(FancyBboxPatch((x,cy-5),width*ours/100,10,boxstyle='round,pad=0,rounding_size=5',facecolor='#169984',edgecolor='none'))
  ax.scatter([x+width*paper/100],[cy],marker='D',s=50,color='#d39838',edgecolors='white',linewidths=1,zorder=4)
  extra='Strict success · mean reward '+score(r['metrics']['mean_reward']) if domain=='webshop' else 'Different user simulator + account-review protocol' if domain=='telecom' else ROUTES[domain]
  ax.text(x,y+62,extra,fontsize=9,color='#66768b',va='center')
  ax.text(894,y+32,f'{ours:.2f}%',fontsize=21,fontweight='bold',color='#0c7968',ha='right',va='center')
  ax.text(1053,y+32,f'{paper:.2f}%',fontsize=16,color='#67758a',ha='right',va='center')
  ax.text(1259,y+32,f'{gap:+.2f} pp',fontsize=15,fontweight='bold',color='#344967',ha='right',va='center')
  ax.text(1259,y+58,'reference only' if domain!='telecom' else 'different protocol',fontsize=9,color='#7e899a',ha='right',va='center')
 ax.text(52,670,'●  Our completed tests: 3 repeats     ◆  Life-Harness: author-reported paper waterline',fontsize=10,color='#53657b',va='center')
 ax.text(52,699,'Paper AgentBench uses 1 repeat. Numerical gaps are descriptive; they are not equal-protocol superiority claims.',fontsize=9,color='#778498',va='center')
 fig.savefig(ROOT/'assets/leaderboard.png',dpi=160,facecolor=fig.get_facecolor());plt.close(fig)

def artifact_links(r):
 a=r['artifact'];return f'[Source]({a}/plugins) · [Diagram]({a}#architecture) · [Curve]({a}#evolution)'
def records():return [json.loads(f.read_text()) for f in sorted((ROOT/'results').glob('*--*.json'))]
def validate(r):
 a=ROOT/r['artifact'];c=r['coverage'];m=r['metrics']
 assert r['benchmark'] in NAMES and r['evaluation_complete'] is True
 assert a.is_relative_to(ROOT/'harnesses') and a.is_dir()
 assert c['valid_episodes']==c['tasks']*c['repeats'] and c['invalid_episodes']==0
 assert 0<=m['pass_at_1']<=1
 for v in m.values():assert v is None or 0<=v<=1
 for name in ['composition.json','protocol.json','curve.json','diagram.mmd','card.json']:assert (a/name).is_file(),name
 composition=json.loads((a/'composition.json').read_text())
 for method in composition['methods']:assert (a/method['module']).is_file()
 assert r['protocol']==json.loads((a/'protocol.json').read_text()),'Result and artifact protocol differ'
 return a

def plot(a,r,reference):
 points=json.loads((a/'curve.json').read_text())['points']
 fig,axes=plt.subplots(2,1,figsize=(10.2,6.5),sharex=True,gridspec_kw={'height_ratios':[2,1.3]})
 fig.patch.set_facecolor('#f7f9fc')
 for ax in axes:
  ax.set_facecolor('white');ax.spines[['top','right']].set_visible(False)
  ax.spines[['left','bottom']].set_color('#ced6e0');ax.grid(axis='y',color='#edf0f5');ax.set_ylim(0,105)
 for key,label,color in [('after','Candidate train','#bf7a24'),('champion_validation','Selected validation','#3861d8')]:
  valid=[p for p in points if p.get(key) is not None]
  if valid:axes[0].plot([p['round'] for p in valid],[p[key]*100 for p in valid],'.-',label=label,color=color,linewidth=1.6,markersize=4)
 axes[0].set_title(f"{NAMES[r['benchmark']]}  /  {r['release_id']}",loc='left',fontweight='bold',pad=16)
 axes[0].set_ylabel('Mean reward / 100' if r['benchmark']=='webshop' else 'Success / %')
 axes[0].legend(loc='lower right',frameon=False,fontsize=9)
 key='strict_test' if r['benchmark']=='webshop' else 'test'
 valid=[p for p in points if p.get(key) is not None]
 if valid:
  axes[1].scatter([p['round'] for p in valid],[p[key]*100 for p in valid],color='#0d876f',s=36,label='Measured checkpoint tests',zorder=3)
 selected=next((p['round'] for p in points if str(p['version']).lstrip('v0')==r['checkpoint'].lstrip('v0')),r['rounds'])
 axes[1].scatter([selected],[r['metrics']['pass_at_1']*100],marker='*',s=170,color='#0d876f',edgecolor='white',zorder=4,label='Released checkpoint')
 axes[1].axhline(reference,linestyle='--',color='#8c96a8',linewidth=1,label='Life-Harness paper (reference only)')
 axes[1].set_ylabel('Test success / %');axes[1].set_xlabel('Candidate / round index')
 axes[1].legend(loc='lower right',frameon=False,fontsize=8)
 maximum=max([p['round'] for p in points]+[r['rounds']]);axes[1].set_xlim(-.6,maximum+.6)
 fig.text(.09,.015,'Development batches may rotate. Missing tests are not interpolated. Paper and local protocols differ.',fontsize=8,color='#526177')
 fig.tight_layout(rect=[0,.035,1,1]);fig.savefig(a/'evolution.png',dpi=150,facecolor=fig.get_facecolor());plt.close(fig)

def artifact_page(a,r):
 c=json.loads((a/'card.json').read_text());p=r['protocol'];composition=json.loads((a/'composition.json').read_text())
 lines=[f"# {NAMES[r['benchmark']]} · {r['checkpoint']}",'',c['summary'],'',
 '| Test success | Selected checkpoint | Plugin registrations | Test coverage |','|---:|---|---:|---|',
 f"| **{pct(r['metrics']['pass_at_1'])}** | **{r['checkpoint']}** / {r['rounds']} rounds | {len(composition['methods'])} | {r['coverage']['tasks']} tasks × {r['coverage']['repeats']} repeats |",'',
 '[**Plugin source**](plugins) · [**Architecture**](#architecture) · [**Evolution curve**](#evolution) · [**Run**](#load-this-artifact) · [**All harnesses**](../../../README.md#choose-a-harness)','',
 f"Actor: **{p['actor']}** · Optimizer: **{r['optimizer']}** · Method: **{r['method']}**.",'',
 '## Architecture','', '```mermaid',(a/'diagram.mmd').read_text().strip(),'```','',
 c.get('diagram_note','Arrows show runtime responsibilities, not independent causal gains.'),'','## Evolution','',
 '![Recorded evolution](evolution.png)','',
 '[Machine-readable curve](curve.json) · [Evaluation protocol](protocol.json) · [Composition](composition.json)','',
 'Development curves show recorded candidate scores; rotating batches can cause rises and falls. Test dots represent actual measurements only. WebShop development scores here are mean reward; its published ranking uses strict success.','',
 '## Plugin inventory','']
 if len(composition['methods'])>12:lines+=['<details>','<summary>Expand all native registrations and responsibilities</summary>','']
 lines+=['| Module | Responsibility |','|---|---|']
 for m in composition['methods']:
  name=Path(m['module']).name;responsibility=c['responsibilities'].get(m['id'],c['responsibilities'].get(name,m.get('surface','Runtime intervention')))
  lines.append(f"| [{name}]({m['module']}) | {responsibility} |")
 if len(composition['methods'])>12:lines+=['','</details>']
 lines+=['','## Load this artifact','','```bash',f"MODEL_BASE_URL=http://localhost:8000/v1 node tools/serve.mjs {r['artifact']}",'```','',
 'Run from the repository root after `npm install`. This starts the native DSH bridge. Supply the benchmark environment/executor separately; see [integration instructions](../../../docs/RUNNING.md).','',
 '## Evaluation notes','']+['- '+n for n in r['notes']]+['',
 'Export changes are limited to portable module paths, selectable listener ports, runtime configuration, and removal of local-path metadata. Reported scores come from the original completed evaluations; the packaged copy has not been scored again.','']
 (a/'README.md').write_text('\n'.join(lines))

def main():
 rows=records();paper=json.loads((ROOT/'results/life-harness-paper.json').read_text());refs={r['id']:r for r in paper['rows']}
 local={r['id']:r for r in json.loads((ROOT/'results/local-references.json').read_text())}
 for r in rows:
  a=validate(r);plot(a,r,refs[r['benchmark']]['full']*100);artifact_page(a,r)
 winners={d:max([r for r in rows if r['benchmark']==d],key=lambda r:(r['metrics']['pass_at_1'],r['published_on'])) for d in NAMES}
 overview(winners,refs)
 table=['| Benchmark | Released artifact | Ours Pass@1 | Life-Harness paper | Numerical gap |','|---|---|---:|---:|---:|']
 for d,r in winners.items():
  gap=(r['metrics']['pass_at_1']-refs[d]['full'])*100
  table.append(f"| {NAMES[d]} | [{r['checkpoint']} · {r['method']}]({r['artifact']}) | **{pct(r['metrics']['pass_at_1'])}** | {pct(refs[d]['full'])} | {gap:+.2f} pp |")
 table+='\nUpdated from published release records. Numerical differences are descriptive, not protocol-matched superiority claims.'.splitlines()
 readme=ROOT/'README.md';text=readme.read_text();cards=['| Harness · success | What it solves | Selected artifact | Explore |','|---|---|---|---|']
 for d,r in winners.items():cards.append(f"| **{NAMES[d]} · {pct(r['metrics']['pass_at_1'])}** | {PURPOSES[d]} | [{r['checkpoint']} · {count_modules(r)} registrations]({r['artifact']}) | {artifact_links(r)} |")
 text=re.sub(r'<!-- LEADERBOARD:START -->.*?<!-- LEADERBOARD:END -->','<!-- LEADERBOARD:START -->\n\n'+'\n'.join(cards)+'\n\n<!-- LEADERBOARD:END -->',text,flags=re.S);readme.write_text(text)
 lines=['# Published harness leaderboard','', '![Current published harnesses](assets/leaderboard.png)','', '[Choose a harness](README.md#choose-a-harness) · [All curves](docs/CURVES.md) · [Publish an update](docs/PUBLISHING.md)','', 'Updated by release, with prior artifacts retained. Actor: Qwen3-4B-Instruct-2507. Ranking uses success, not WebShop partial reward.','']+table+['',
 '## Waterlines: sources kept separate','', '| Benchmark | Paper bare | Paper Life-Harness | Local bare | Local Life-Harness full | Published best |','|---|---:|---:|---:|---:|---:|']
 for d,r in winners.items():
  l=local[d];bare=l['baseline_strict'] if d=='webshop' else l['baseline']
  lines.append(f"| {NAMES[d]} | {pct(refs[d]['baseline'])} | {pct(refs[d]['full'])} | {pct(bare)} | {pct(l['full'])} | {pct(r['metrics']['pass_at_1'])} |")
 lines+=['','— means not available in the aligned local record, not zero. Local references are measurements in our environment, not author claims. Their detailed protocol comparability is described in [metrics](docs/METRICS.md).','',
 '## Additional metrics','', '| Benchmark | Metric | Ours | Life-Harness paper |','|---|---|---:|---:|']
 w=winners['webshop'];t=winners['telecom']
 lines += [f"| WebShop | Mean reward / 100 | {score(w['metrics']['mean_reward'])} | Not reported in main comparison |",f"| τ²-Telecom | Pass@3: at least one of three | {pct(t['metrics']['pass_at_3'])} | {pct(refs['telecom']['pass_at_3'])} |",f"| τ²-Telecom | Pass³: all three | {pct(t['metrics']['pass_cubed'])} | {pct(refs['telecom']['pass_cubed'])} |",'',
 '## Evolution cost','', '| Benchmark | Our evolution tokens | Paper Life-Harness evolution tokens |','|---|---:|---:|']
 for d,r in winners.items():lines.append(f"| {NAMES[d]} | {r['evolution_tokens'] if r['evolution_tokens'] is not None else 'Not consolidated'} | {refs[d]['evolution_tokens']/1e6:g} million |")
 lines+=['','Paper costs are rounded from Table 1. Our missing aggregate is not zero; no efficiency advantage is claimed.','',
 '## All published versions','', '| Benchmark | Release | Checkpoint | Pass@1 | Mean reward / 100 | Date |','|---|---|---|---:|---:|---|']
 for r in sorted(rows,key=lambda r:(r['benchmark'],-r['metrics']['pass_at_1'])):lines.append(f"| {NAMES[r['benchmark']]} | [{r['release_id']}]({r['artifact']}) | {r['checkpoint']} | {pct(r['metrics']['pass_at_1'])} | {score(r['metrics']['mean_reward'])} | {r['published_on']} |")
 lines+=['','Sources: [Life-Harness paper, Tables 1 and 10](https://arxiv.org/html/2605.22166v3), [official implementation](https://github.com/Tianshi-Xu/Life-Harness), and this repository’s [release records](results).','']
 (ROOT/'LEADERBOARD.md').write_text('\n'.join(lines))
 curves=['# Evolution curves','','Recorded development scores and measured test checkpoints for the current published artifacts. Unmeasured test points are left empty.','']
 for d,r in winners.items():
  curves += [f"## {NAMES[d]}",'',f"[{r['release_id']} — architecture and plugins](../{r['artifact']})",'',f"![{NAMES[d]} evolution](../{r['artifact']}/evolution.png)",'']
 (ROOT/'docs/CURVES.md').write_text('\n'.join(curves))
 (ROOT/'results/leaderboard.json').write_text(json.dumps({'schema_version':1,'update_mode':'release-driven','champions':winners,'releases':rows},ensure_ascii=False,indent=2)+'\n')
 print(f'Rendered {len(rows)} releases across {len(winners)} benchmarks.')
if __name__=='__main__':main()
