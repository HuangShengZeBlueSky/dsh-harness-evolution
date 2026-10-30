"""Native DSH continuation, agent-map-guided evolution and benchmark-specific loops."""
from pathlib import Path
import argparse,json,re,time,shutil,statistics
from astra_evolve.project import Project
from astra_evolve.records import summary,key,read,write

class Campaign(Project):
 def inspect(self,parent=None):
  parent=parent or self.best();src=self.root/'frozen'/parent
  if not src.exists():src=self.candidate(parent)
  comp=read(src/'composition.json');enabled=set(comp.get('selected',[]));modules=[]
  for m in comp.get('methods',[]):
   if m['id'] not in enabled:continue
   path=Path(m['module']);path=path if path.is_absolute() else src/path
   text=path.read_text();hooks=sorted(set(re.findall(r"(?:on|once)\(\s*['\"]([^'\"]+)['\"]",text)))
   modules.append({'id':m['id'],'module':m['module'],'hooks_seen_in_source':hooks})
  lines=['# 当前Agent结构与插件能力',f'父版：{parent}。执行链：任务/可见消息 → 做题模型 → DSH工具前处理 → 真实环境 → 回执/状态更新 → 下一步。','以下为源码登记事实；实际能力与覆盖需结合本组训练轨迹判断。','']
  lines += [f"- {m['id']}：{m['module']}；源码钩子：{', '.join(m['hooks_seen_in_source']) or '需阅读模块确认'}。" for m in modules]
  if not modules:lines.append('- 当前没有增强插件。')
  lines+=['','## 本轮分析','由优化器补充：每个插件解决的问题、已验证能力、当前薄弱点、重叠/冲突、下一候选的新职责。先维护此处，再提出插件。']
  (self.base/'AGENT_STATE.md').write_text('\n'.join(lines)+'\n');write(self.base/'agent-state.json',{'parent':parent,'at':time.time(),'modules':modules});return parent
 def prepare(self,name,parent=None):
  parent=parent or self.best()
  if parent!=self.best():raise ValueError('This campaign continues from its selected champion')
  if self.cfg['loop'].get('require_agent_map'):self.inspect(parent)
  super().prepare(name,parent)
  if self.cfg['loop'].get('require_agent_map'):
   shutil.copy2(self.base/'AGENT_STATE.md',self.candidate(name)/'agent-state.md');write(self.candidate(name)/'state-reference.json',read(self.base/'agent-state.json'))
 def evaluate(self,name,split='development',batch=None):
  if split in ['test','all']:
   seal=read(self.root/'final-checkpoint.json') if (self.root/'final-checkpoint.json').exists() else {}
   if split!='test' or seal.get('candidate')!=name:raise ValueError('Only the final selected checkpoint may be tested after all configured decisions')
  if name!='baseline' and self.cfg['loop'].get('require_agent_map'):
   p=self.candidate(name)
   if not (p/'proposal.md').exists() or not (p/'proposal.md').read_text().strip():raise ValueError('Maintain agent-state.md and write a concise proposal.md before evaluation')
  return super().evaluate(name,split,batch)
 def report(self,name,parent=None):
  r=super().report(name,parent);parent=r['parent'];mode=self.cfg['loop']['variant'];domain=self.cfg['domain'];observed=bool(r['observed_changed_plugins']);train_gain=r['after']['mean']-r['before']['mean'];eligible=observed and train_gain>0;va=vb=None
  if 'validation' in self.tasks:
   a,b=self.rows(parent,'validation'),self.rows(name,'validation');va,vb=summary(a)['mean'],summary(b)['mean'];eligible=eligible and vb>=va
  r.update(validation_before=va,validation_after=vb,selection_metric='mean_reward' if domain=='WebShop' else 'success')
  if mode=='L5' and domain=='WebShop':
   before,after=self.rows(parent,'train',self.batch(name)),self.rows(name,'train',self.batch(name));strict=lambda rs:sum(v['score']==1 for v in rs)/len(rs)
   sa,sb= strict(before),strict(after);vsa,vsb=strict(a),strict(b);eligible=observed and sb>sa and vsb>=vsa
   r.update(selection_metric='strict_success',train_strict_before=sa,train_strict_after=sb,validation_strict_before=vsa,validation_strict_after=vsb)
  if mode=='L5' and domain=='DBBench':
   nxt=self.batch(name)%len(self.batches)+1
   for version in [parent,name]:self.evaluate(version,'train',batch=nxt)
   ra,rb=summary(self.rows(parent,'train',nxt))['mean'],summary(self.rows(name,'train',nxt))['mean'];eligible=eligible and rb>=ra;r['cross_batch_review']={'batch':nxt,'before':ra,'after':rb}
  if mode=='L5' and domain=='OSBench':
   families=self.cfg['loop']['validation_families'];keys={v['task_id']:v for v in a};grouped={}
   for v in b:
    family=families[v['task_id']];grouped.setdefault(family,[[],[]]);grouped[family][0].append(keys[v['task_id']]['score']);grouped[family][1].append(v['score'])
   ma=statistics.mean(statistics.mean(v[0]) for v in grouped.values());mb=statistics.mean(statistics.mean(v[1]) for v in grouped.values());eligible=eligible and mb>=ma;r['validation_family_macro']={'before':ma,'after':mb,'families':len(grouped)}
  r['eligible_to_adopt']=eligible;write(self.base/'materials'/name/'loop-comparison.json',r);return r
 def decide(self,name,adopt,reason):
  target=self.root/'decisions'/(name+'.json')
  if target.exists():raise ValueError('Decision exists')
  if (self.root/'final-checkpoint.json').exists():raise ValueError('Final selection already sealed')
  r=self.report(name)
  if adopt and (r['parent']!=self.best() or not r['eligible_to_adopt']):raise ValueError('Candidate did not meet the configured adoption rule')
  if adopt:write(self.root/'best.json',{'candidate':name})
  write(target,{'candidate':name,'parent':r['parent'],'adopted':adopt,'champion_changed':adopt,'training':r['after'],'validation':r['validation_after'],'parent_validation':r['validation_before'],'validation_strict_success':r.get('validation_strict_after'),'selection_metric':r['selection_metric'],'loop':self.cfg['loop']['variant'],'reason':reason,'at':time.time()})
  print(json.dumps({'retained':adopt,'best':self.best(),'rule':self.cfg['loop']['variant']}))
 def finish(self):
  self.require_decisions();best=self.best()
  if 'validation' in self.tasks:
   for version in ['baseline']+[f'v{i:02d}' for i in range(1,self.cfg['rounds']+1)]:self.rows(version,'validation')
  write(self.root/'final-checkpoint.json',{'candidate':best,'rounds':self.cfg['rounds'],'at':time.time(),'selection':'configured development rule; test never used'})
  self.evaluate(best,'test');final={'rounds':self.cfg['rounds'],'best':best,'loop':self.cfg['loop']['variant'],'train':{'best':summary(self.rows(best,'train'))},'test':{'best':summary(self.rows(best,'test'))},'test_policy':'only final selected checkpoint','startpoint':self.cfg['start_label'],'selection_metric':self.cfg['loop'].get('selection_metric','default')}
  if 'validation' in self.tasks:final['validation']={'best':summary(self.rows(best,'validation'))}
  write(self.root/'final.json',final)
  if not (self.base/'best').exists():shutil.copytree(self.root/'frozen'/best,self.base/'best',ignore=shutil.ignore_patterns('node_modules'))
  (self.root/'completed.txt').write_text(f'{self.cfg["rounds"]} candidates and final selected checkpoint test complete\n')
