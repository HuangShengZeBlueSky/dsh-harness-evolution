from pathlib import Path
import json,time

def read(p,default=None):
 try:return json.loads(Path(p).read_text())
 except (OSError,ValueError):return {} if default is None else default

def write(p,j):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);t=p.with_suffix('.tmp');t.write_text(json.dumps(j,ensure_ascii=False,indent=2));t.replace(p)

def select(root,cfg,name,parent,train,before,val,parent_val,observed,replay,adopt,reason):
 root=Path(root);target=root/'decisions'/(name+'.json')
 if target.exists():raise ValueError('Decision already recorded')
 if (root/'final-checkpoint.json').exists():raise ValueError('Selection sealed before final test')
 best=read(root/'best.json').get('candidate','baseline');mode=cfg['loop']['variant']
 archive=read(root/'archive.json',{'entries':[{'candidate':parent,'validation':parent_val,'uses':0}]})['entries']
 champion_val=read(root/'selection.json').get('validation',parent_val)
 eligible=bool(observed)
 if mode in ['L1','L2']:
  eligible=eligible and parent==best and train['mean']>before['mean'] and val>=parent_val
  if mode=='L2':eligible=eligible and replay['after']>=replay['before']
 else:
  eligible=eligible and parent in [x['candidate'] for x in archive] and (len(archive)<3 or val>=min(x['validation'] for x in archive))
 if adopt and not eligible:raise ValueError('Not eligible under configured loop; record rejection instead')
 promoted=False
 if adopt:
  if mode!='L3' or val>champion_val:
   best=name;champion_val=val;promoted=True;write(root/'best.json',{'candidate':best})
  if mode=='L3':
   archive=[x for x in archive if x['candidate']!=name]+[{'candidate':name,'validation':val,'uses':0}]
   archive=sorted(archive,key=lambda x:(x['validation'],x['candidate']),reverse=True)[:3]
 write(root/'archive.json',{'entries':archive})
 write(root/'selection.json',{'candidate':best,'validation':champion_val,'selection':'validation; never test'})
 write(target,{'candidate':name,'parent':parent,'adopted':adopt,'champion_changed':promoted,'reason':reason,'training':train,'validation':val,'parent_validation':parent_val,'replay':replay,'actual_change_observed':bool(observed),'at':time.time(),'loop':mode})
 return best

def parent(root,cfg):
 root=Path(root)
 if cfg['loop']['variant']!='L3':return read(root/'best.json').get('candidate','baseline')
 entries=read(root/'archive.json',{'entries':[]})['entries']
 return min(entries,key=lambda x:(x.get('uses',0),-x['validation']))['candidate'] if entries else 'baseline'

def visit(root,name):
 root=Path(root);obj=read(root/'archive.json')
 for e in obj.get('entries',[]):
  if e['candidate']==name:e['uses']=e.get('uses',0)+1
 if obj:write(root/'archive.json',obj)
