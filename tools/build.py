"""Render public results and actual recorded curves. Never run an experiment."""
from pathlib import Path
import json, re
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import comparison

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
 axes[1].axhline(reference[1]*100,linestyle='--',color='#8c96a8',linewidth=1,label=f'Highest paper value: {reference[0]} (reference)')
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
 catalog=json.loads((ROOT/'results/paper-baselines.json').read_text())
 for r in rows:
  reference=max([(m['label'],m['pass_at_1'][r['benchmark']]) for m in catalog['methods'] if m['id']!='bare' and m['pass_at_1'][r['benchmark']] is not None],key=lambda x:x[1])
  a=validate(r);plot(a,r,reference);artifact_page(a,r)
 winners={d:max([r for r in rows if r['benchmark']==d],key=lambda r:(r['metrics']['pass_at_1'],r['published_on'])) for d in NAMES}
 readme=ROOT/'README.md';text=readme.read_text();cards=['| Harness · success | What it solves | Selected artifact | Explore |','|---|---|---|---|']
 for d,r in winners.items():cards.append(f"| **{NAMES[d]} · {pct(r['metrics']['pass_at_1'])}** | {PURPOSES[d]} | [{r['checkpoint']} · {count_modules(r)} registrations]({r['artifact']}) | {artifact_links(r)} |")
 text=re.sub(r'<!-- LEADERBOARD:START -->.*?<!-- LEADERBOARD:END -->','<!-- LEADERBOARD:START -->\n\n'+'\n'.join(cards)+'\n\n<!-- LEADERBOARD:END -->',text,flags=re.S);readme.write_text(text)
 curves=['# Evolution curves','','Recorded development scores and measured test checkpoints for the current published artifacts. Unmeasured test points are left empty.','']
 for d,r in winners.items():
  curves += [f"## {NAMES[d]}",'',f"[{r['release_id']} — architecture and plugins](../{r['artifact']})",'',f"![{NAMES[d]} evolution](../{r['artifact']}/evolution.png)",'']
 (ROOT/'docs/CURVES.md').write_text('\n'.join(curves))
 comparison.render(ROOT,winners,rows,refs,local)
 (ROOT/'results/leaderboard.json').write_text(json.dumps({'schema_version':1,'update_mode':'release-driven','champions':winners,'releases':rows,'paper_references':catalog,'telecom_history':json.loads((ROOT/'results/life-harness-telecom-history.json').read_text())},ensure_ascii=False,indent=2)+'\n')
 print(f'Rendered {len(rows)} releases across {len(winners)} benchmarks.')
if __name__=='__main__':main()
