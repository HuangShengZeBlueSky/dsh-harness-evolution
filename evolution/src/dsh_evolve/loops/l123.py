from pathlib import Path
import argparse,json,shutil
from astra_evolve.project import Project
from astra_evolve.records import summary,key
from .loop_policy import read,write,select,parent as pick_parent,visit

class LoopProject(Project):
 def evaluate(self,name,split='development',batch=None):
  if split in ['test','all']:
   seal=read(self.root/'final-checkpoint.json')
   if split!='test' or seal.get('candidate')!=name:raise ValueError('Only sealed final checkpoint may be tested; use finish after 20 decisions')
  return super().evaluate(name,split,batch)
 def prepare(self,name,parent=None):
  chosen=parent or pick_parent(self.root,self.cfg)
  if self.cfg['loop']['variant']!='L3' and chosen!=self.best():raise ValueError('Single-chain loop must use current best')
  super().prepare(name,chosen);visit(self.root,chosen)
 def report(self,name,parent=None):
  r=super().report(name,parent);p=r['parent'];a=self.rows(p,'validation');b=self.rows(name,'validation')
  ids=set(read(self.base/'replay-ids.json',[]));ar=self.rows(p,'train',self.batch(name));br=self.rows(name,'train',self.batch(name));old={key(v):v for v in ar}
  selected=[v for v in br if v['task_id'] in ids]
  replay={'before':sum(old[key(v)]['score'] for v in selected),'after':sum(v['score'] for v in selected),'episodes':len(selected)}
  r.update(validation_before=summary(a)['mean'],validation_after=summary(b)['mean'],replay=replay)
  r['training_only_eligible']=r['eligible_to_adopt'];mode=self.cfg['loop']['variant']
  if mode=='L3':
   archive=read(self.root/'archive.json',{'entries':[]})['entries']
   r['eligible_to_adopt']=bool(r['observed_changed_plugins']) and (len(archive)<3 or r['validation_after']>=min(e['validation'] for e in archive))
  else:
   r['eligible_to_adopt']=r['eligible_to_adopt'] and r['validation_after']>=r['validation_before'] and (mode!='L2' or replay['after']>=replay['before'])
  write(self.base/'materials'/name/'loop-comparison.json',r);return r
 def decide(self,name,adopt,reason):
  self.freeze_experiment();r=self.report(name)
  best=select(self.root,self.cfg,name,r['parent'],r['after'],r['before'],r['validation_after'],r['validation_before'],r['observed_changed_plugins'],r['replay'],adopt,reason)
  print(json.dumps({'candidate':name,'retained':adopt,'best':best}))
 def finish(self):
  self.require_decisions()
  for name in ['baseline']+[f'v{i:02d}' for i in range(1,self.cfg['rounds']+1)]:self.rows(name,'validation')
  best=self.best();write(self.root/'final-checkpoint.json',{'candidate':best,'rounds':self.cfg['rounds'],'selection':'loop training/validation only','at':__import__('time').time()})
  self.evaluate(best,'test')
  training=summary(self.rows(best,'train'));validation=summary(self.rows(best,'validation'));testing=summary(self.rows(best,'test'))
  out=self.base/'best'
  if not out.exists():shutil.copytree(self.root/'frozen'/best,out,ignore=shutil.ignore_patterns('node_modules'))
  write(self.root/'final.json',{'rounds':self.cfg['rounds'],'best':best,'loop':self.cfg['loop']['variant'],'train':{'best':training},'validation':{'best':validation},'test':{'best':testing},'test_policy':'only final selected checkpoint; no baseline or intermediate tests'})
  (self.root/'completed.txt').write_text(f'{self.cfg["rounds"]} candidates and final selected checkpoint test complete\n')
