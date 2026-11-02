"""One table for literature, local measurements and pending common-task evaluations."""
from pathlib import Path
import json
BENCHES=['alfworld','dbbench','webshop','osbench','telecom']
NAMES={'alfworld':'ALFWorld','dbbench':'DBBench','webshop':'WebShop','osbench':'OSBench','telecom':'Telecom'}
GROUPS={'paper_qwen':('Qwen3-4B：论文报告与本方法','Qwen3-4B: literature and our framework'),'paper_other':('论文报告 · 其他执行模型','Paper reports · other executors'),'local':('共同执行模型实测 · Qwen3-4B','Local measurements · Qwen3-4B'),'frozen_web':('共同冻结环境 · WebShop','Common frozen environment · WebShop'),'pending':('待适配或待资源的相关方法','Related methods awaiting adapters or resources')}
def read(p,default=None):return json.loads(p.read_text()) if p.exists() else ({} if default is None else default)
def build(root):
 root=Path(root);data=root/'results/research';refs=read(root/'results/paper-baselines.json')['methods'];board=read(root/'results/leaderboard.json')['best_measured'];runs=read(data/'runs.json')['runs'];reps=read(data/'repeated-tests.json').get('results',[]);pc=read(data/'paper-evolution.json')['curves'];rows=[]
 def add(key,name,actor,source,group,rounds=None,values=None,tokens=None,states=None,std=None,cite=None):
  r=dict(id=key,method=name,executor=actor,source=source,group=group,rounds=rounds,values={b:None for b in BENCHES},tokens={b:None for b in BENCHES},std={b:None for b in BENCHES},states={b:'unreported' for b in BENCHES},citations=cite or [])
  r['values'].update(values or {});r['tokens'].update(tokens or {});r['std'].update(std or {});r['states'].update(states or {});rows.append(r);return r
 def source_cost(method):return {b:next(x for x in pc if x['method']==method and x['benchmark']==b)['points'][-1]['optimizer_tokens'] for b in BENCHES}
 for m in refs:
  name=m['label'].split(' / ')[0];method={'meta':'Meta-Harness','ahe':'AHE','life':'Life-Harness'}.get(m['id']);cite={'meta':['meta','life'],'ahe':['ahe','life'],'life':['life'],'align':['align','life'],'agentsquare':['agentsquare','life'],'skillfm':['skillfm']}.get(m['id'],['life'])
  add('paper-'+m['id'],name,'Qwen3-4B','P*' if m['id']=='skillfm' else 'P-L','paper_qwen',6 if method else None,m['pass_at_1'],source_cost(method) if method else None,cite=cite)
 history=read(root/'results/life-harness-telecom-history.json').get('versions',[])
 older=[x for x in history if x.get('version') in ['v1','v2']]
 if older:add('paper-life-earlier','Life-Harness v1/v2','Qwen3-4B','P-v1/2','paper_qwen',values={'telecom':older[0]['metrics']['pass_at_1']},cite=['life'])
 add('paper-harness-r1','Harness-R1','Qwen3-4B','P*','paper_qwen',values=dict(alfworld=.291,dbbench=.557,webshop=.386),cite=['harness-r1'])
 costs={};vals={};std={}
 for b,a in board.items():
  g=next((g for g in runs if g['id']==a['source_experiment']),{});costs[b]=((g.get('token_accounting') or {}).get('optimizer') or {}).get('total_tokens');vals[b]=a['metrics']['pass_at_1'];x=next((x for x in reps if x['method']=='DSH' and x['benchmark']==b and x.get('complete')),{});std[b]=x.get('sample_std')
 ours=add('ours-historical','Our framework','Qwen3-4B','H','paper_qwen','8–40',vals,costs,std=std);ours['ours']=True
 for key,name,v in [('skillopt','SkillOpt',.955),('gepa','GEPA (SkillOpt evaluation)',.858),('textgrad','TextGrad (SkillOpt evaluation)',.828)]:add('paper-'+key,name,'GPT-5.5','P-S','paper_other',values={'alfworld':v},cite=[key,'skillopt'])
 add('paper-harnessx','HarnessX','Qwen3.5-9B','P2','paper_other',values={'alfworld':.97,'webshop':.49},cite=['harnessx'])
 add('paper-curator-gemini','GEPA-Curator / Gemini','gpt-oss-120b','P*','paper_other',values={'alfworld':.918},std={'alfworld':.014},cite=['gepa-curator'])
 add('paper-curator-claude','GEPA-Curator / Claude','gpt-oss-120b','P*','paper_other',values={'alfworld':.984},std={'alfworld':.006},cite=['gepa-curator'])
 aliases=[('Life-Harness public built-in','Life-Harness (released)'),('ALIGN released ReAct interface','ALIGN (released)'),('ReAct','ReAct'),('ReflAct','ReflAct'),('AutoManual','AutoManual'),('Harness-R1 released patch','Harness-R1 (released patch)')]
 jobs=read(data/'competitor-evaluations.json').get('jobs',[])+read(data/'expanded-competitor-evaluations.json').get('jobs',[])
 for method,label in aliases:
  known=[x for x in reps if x['method']==method and x.get('complete') and x.get('comparison_eligible',True)]
  live=[x for x in jobs if x.get('method',x.get('protocol',{}).get('method'))==method or (method=='Harness-R1 released patch' and x.get('id')=='harness-r1-dbbench')]
  if not known and not live and method not in ['ReAct','ReflAct','AutoManual','Harness-R1 released patch']:continue
  r=add('local-'+method.lower().replace(' ','-'),label,'Qwen3-4B','M','local',cite={'ReAct':['react'],'ReflAct':['reflact'],'AutoManual':['automanual'],'Harness-R1 released patch':['harness-r1']}.get(method,[]))
  for x in live:
   b=x['benchmark'];s=x.get('summary') or {};r['states'][b]='running'
   if s.get('complete'):r['values'][b]=s.get('mean');r['std'][b]=s.get('sample_std');r['states'][b]='measured'
  for x in known:r['values'][x['benchmark']]=x['mean'];r['std'][x['benchmark']]=x.get('sample_std');r['states'][x['benchmark']]='measured'
  if not known and not live:r['states']['dbbench' if method=='Harness-R1 released patch' else 'alfworld']='running'
 cohort=read(data/'webshop-frozen-comparison.json').get('methods',[])
 frozen={x['id']:x for x in jobs if x.get('benchmark')=='webshop' and x.get('id') in ['life','align','ours-v10','ours-v12']}
 frozen.update({x['id']:x for x in cohort})
 for ident,label in [('life','Life-Harness'),('align','ALIGN'),('ours-v10','Our framework / checkpoint A'),('ours-v12','Our framework / checkpoint B')]:
  if ident not in frozen:continue
  x=frozen[ident];s=x.get('summary') or {};r=add('frozen-'+ident,label,'Qwen3-4B','F','frozen_web',states={'webshop':'running'})
  if s.get('complete'):r['values']['webshop']=s['mean'];r['std']['webshop']=s.get('sample_std');r['states']['webshop']='measured'
  if ident.startswith('ours'):r['ours']=True
 pending=[('ExpeL',['alfworld','webshop'],'pending',['expel']),('AgentSquare (local)',['alfworld','webshop'],'pending',['agentsquare']),('Verify–Backtrack Loop',['alfworld'],'pending',['vbl']),('GEPA-Curator (local)',['alfworld'],'pending',['gepa-curator']),('SkillFM (local)',['alfworld','webshop'],'weights',['skillfm'])]
 for name,benches,state,citations in pending:add('pending-'+citations[0],name,'Qwen3-4B','Q','pending',states={b:state for b in benches},cite=citations)
 literature=read(data/'literature-sources.json')
 for row in rows:row['paper_urls']=[literature[k]['url'] for k in row['citations'] if k in literature]
 return dict(title_zh='统一主表：性能、模型、数据来源与优化预算',title_en='Unified main comparison: performance, models, provenance and optimization budget',benchmarks=BENCHES,groups={k:{'zh':v[0],'en':v[1]} for k,v in GROUPS.items()},rows=rows,notes_zh='每格先列成功率及可用标准差，再列累计优化Token（百万）。P-L：Life-Harness论文适配对照；P-S：SkillOpt论文评测；P*：原文划分；P2：进化集峰值pass@2；M：本地测量；H：历史释放产物；F：共同冻结WebShop环境；Q：待适配或资源。不同分组保留各自协议。',notes_en='Cells give success and available SD, then cumulative optimizer tokens in millions. P-L: Life-Harness adaptation; P-S: SkillOpt evaluation; P*: original split; P2: adaptation-set peak pass@2; M: local measurement; H: historical release; F: common frozen WebShop environment; Q: pending adapter/resources. Each group retains its protocol.')

def markdown(data,language='zh'):
 names={'running':'评测中','pending':'待适配','weights':'缺权重','unreported':'—'} if language=='zh' else {'running':'Running','pending':'Pending','weights':'Weights needed','unreported':'—'}
 lines=['| Method | Executor | Source | Rounds | '+' | '.join(NAMES[b] for b in BENCHES)+' |','|---|---|---|---:|'+'---:|'*5]
 group=None
 for row in data['rows']:
  if row['group']!=group:group=row['group'];lines.append('| **'+data['groups'][group][language]+'** | | | | | | | | |')
  cells=[]
  for b in BENCHES:
   value=row['values'][b];sd=row['std'][b];cost=row['tokens'][b]
   if value is None:cells.append(names.get(row['states'][b],'—'));continue
   label=f'{value*100:.2f}'+(f' ± {sd*100:.2f}' if sd is not None else '')
   if cost is not None:label+=f' / {cost/1e6:.2f}M'
   cells.append(label)
  lines.append('| '+row['method']+' | '+row['executor']+' | '+row['source']+' | '+(str(row['rounds']) if row['rounds'] is not None else '—')+' | '+' | '.join(cells)+' |')
 return '\n'.join(lines)

def write(root):
 root=Path(root);data=build(root);p=root/'site/master-comparison.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 for language,suffix in [('zh','.zh-CN'),('en','')]:
  filename='LEADERBOARD'+suffix+'.md'
  (root/filename).write_text('# '+data['title_'+language]+'\n\n'+markdown(data,language)+'\n\n'+data['notes_'+language]+'\n')
  (root/'docs'/('MASTER-COMPARISON'+suffix+'.md')).write_text('[统一主表 / Unified main comparison](../'+filename+')\n')
 return data
