from pathlib import Path
import json,sys,shutil,subprocess,fcntl,argparse,time,yaml,re
import campaign
R=Path(__file__).resolve().parent;RUN=R/'runs';CFG=yaml.safe_load((R/'experiment.yaml').read_text());VALID={'user_stop','agent_stop','max_steps','too_many_errors','timeout'}
def read(p):
 try:return json.loads(p.read_text())
 except (OSError,ValueError):return {}
def write(p,j):
 p.parent.mkdir(parents=True,exist_ok=True);q=p.with_suffix('.tmp');q.write_text(json.dumps(j,ensure_ascii=False,indent=2));q.replace(p)
def path(v):return R/'baseline' if v=='baseline' else RUN/v
def rows(v,split='train'):
 out={}
 for p in path(v).glob(split+'/trial-*/*--t*.json'):
  d=read(p)
  if d.get('reward_info') is not None and d.get('termination_reason') in VALID:out[(d['task_id'],d['trial'],d['seed'])]=float(d['reward_info']['reward'])
 return out
def stats(v,split='train'):
 a=rows(v,split);n=222 if split=='train' else 120
 return dict(valid=len(a),episodes=n,mean=sum(a.values())/n if len(a)==n else None,successes=sum(a.values()))
def reroot(folder,old,new):
 for d in ['plugins','bridge','scripts']:
  for p in (folder/d).rglob('*'):
   if p.is_file() and p.suffix in ['.py','.mjs','.js','.json','.yml']:p.write_text(p.read_text().replace(str(old),str(new)))
 for n in ['profile-template.yml','composition.json','run.py','summarize.py']:
  p=folder/n
  if p.exists():p.write_text(p.read_text().replace(str(old),str(new)))
def freeze(v):
 p=path(v);c=read(p/'composition.json');methods=[m for m in c.get('methods',[]) if m['id'] in c.get('selected',[])]
 profile=yaml.safe_load((p/'profile-template.yml').read_text());entries=[e for e in profile[0]['insert'] if not e['id'].startswith('custom-') and '/plugins/' not in e['name']]
 for e in entries:
  if e['id']=='tau2-h0':e['name']=str(p/'bridge/index.mjs');e['config'].update(workspace=str(p),methods=methods)
 for i,m in enumerate(methods):
  q=Path(m['module']);q=q if q.is_absolute() else p/q;m['module']=str(q)
  subprocess.run([CFG['node'],'--check',str(q)],check=True)
  entries.append({'id':f'custom-{i}','name':str(q),'config':m.get('config',{})})
 profile[0]['insert']=entries;(p/'profile-template.yml').write_text(yaml.safe_dump(profile,sort_keys=False));write(p/'composition.json',c)
 write(p/'frozen.json',dict(at=time.time(),methods=[m['id'] for m in methods]))
def prepare(v,parent):
 if (RUN/'training-seal.json').exists():raise ValueError('Training selection is sealed')
 if not v.startswith('v') or not 1<=int(v[1:])<=CFG['rounds']:raise ValueError('Outside candidate budget')
 out=path(v);src=path(parent)
 if out.exists():raise ValueError('Candidate exists; continue it')
 if stats(parent)['mean'] is None:raise ValueError('Parent training is incomplete')
 shutil.copytree(src,out,symlinks=True,ignore=shutil.ignore_patterns('train','test','dsh','sessions','home','__pycache__','*.log','status.json','process.json','summary.json','*-summary.json','frozen.json','runtime-evidence.json','train-status.json','test-status.json'))
 reroot(out,src,out);c=read(out/'composition.json');c.update(parent=parent,version=int(v[1:]));write(out/'composition.json',c)
 campaign.materials(src,R/'materials'/parent)
 print(str(out))
def evaluate(v,split):
 RUN.mkdir(exist_ok=True)
 if v!='baseline' and split=='train' and not (R/'materials'/v/'repair-plan.json').exists():raise ValueError('Record plan before candidate evaluation')
 with (RUN/'evaluation.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  if stats(v,split)['mean'] is None:
   if split=='test' and len(list((RUN/'decisions').glob('v*.json')))<CFG['rounds']:raise ValueError('Test only after all training decisions')
   if not (path(v)/'frozen.json').exists():freeze(v)
   code=subprocess.call([sys.executable,str(path(v)/'run.py'),split],cwd=path(v))
   s=stats(v,split);write(path(v)/(split+'-summary.json'),s)
   if code or s['mean'] is None:raise RuntimeError('Evaluation incomplete; preserve valid episodes and fill only missing results')
  if split=='train':campaign.materials(path(v),R/'materials'/v)
  print(json.dumps(stats(v,split)))
def bundle(module,seen=None):
 seen={} if seen is None else seen
 module=module.resolve()
 if str(module) in seen:return seen
 text=module.read_text();seen[str(module)]=text
 pattern=r"""(?:from\s*|import\s*)['"](\.[^'"]+)['"]"""
 for rel in re.findall(pattern,text):
  child=(module.parent/rel).resolve()
  if child.is_file():bundle(child,seen)
 return seen

def report(v):
 p=path(v);parent=read(p/'composition.json')['parent'];a=rows(parent);b=rows(v)
 if len(a)!=222 or len(b)!=222 or a.keys()!=b.keys():raise ValueError('Need complete paired training')
 campaign.evidence(p);e=read(p/'runtime-evidence.json').get('plugins',{})
 old={m['id']:m for m in read(path(parent)/'composition.json').get('methods',[])};changed=[]
 for m in read(p/'composition.json').get('methods',[]):
  prev=old.get(m['id']);q=Path(m['module']);q=q if q.is_absolute() else p/q
  before=Path(prev['module']) if prev else None
  if before is not None and not before.is_absolute():before=path(parent)/before
  if prev is None or m.get('config')!=prev.get('config') or list(bundle(q).values())!=list(bundle(before).values()):changed.append(m['id'])
 observed=[i for i in changed if e.get(i,{}).get('events',0)>0 and (e.get(i,{}).get('request_hits',0)>0 or e.get(i,{}).get('denied_audit_events',0)>0)]
 result=dict(parent=parent,candidate=v,before=stats(parent),after=stats(v),improved=sum(b[k]>a[k] for k in a),regressed=sum(b[k]<a[k] for k in a),changed=changed,observed_changed=observed)
 write(R/'materials'/v/'comparison.json',result);return result
def decide(v,adopt,reason):
 if (RUN/'training-seal.json').exists():raise ValueError('Training selection is sealed')
 target=RUN/'decisions'/(v+'.json')
 if target.exists():raise ValueError('Decision already recorded')
 j=report(v);best=read(RUN/'best.json').get('candidate','baseline')
 if adopt and (j['parent']!=best or j['after']['mean']<=j['before']['mean'] or not j['observed_changed']):raise ValueError('Adoption requires best parent, strict full training gain and actual changed-plugin use')
 write(target,dict(candidate=v,parent=j['parent'],adopted=adopt,reason=reason,training=j['after'],at=time.time()))
 if adopt:write(RUN/'best.json',dict(candidate=v))
 print('adopted' if adopt else 'rejected')
def finish():
 if len(list((RUN/'decisions').glob('v*.json')))!=CFG['rounds']:raise ValueError('All 30 decisions required')
 write(RUN/'training-seal.json',dict(at=time.time()))
 best=read(RUN/'best.json').get('candidate','baseline')
 for v in dict.fromkeys(['baseline',best]):evaluate(v,'test')
 write(RUN/'final.json',dict(rounds=CFG['rounds'],best=best,test={v:stats(v,'test') for v in ['baseline',best]}));(RUN/'completed.txt').write_text('30 training candidates and final baseline/best tests complete\n')
ap=argparse.ArgumentParser();ap.add_argument('action',choices=['prepare','plan','evaluate','report','decide','finish']);ap.add_argument('version',nargs='?');ap.add_argument('--parent');ap.add_argument('--split',default='train',choices=['train','test']);ap.add_argument('--adopt',action='store_true');ap.add_argument('--reject',action='store_true');ap.add_argument('--reason',default='');args=ap.parse_args()
if args.action=='prepare':prepare(args.version,args.parent)
elif args.action=='plan':
 a=read(path(args.version)/'analysis.json')
 if not a.get('agent_state') or not a.get('clusters') or not a.get('repairs'):raise ValueError('Explain capability/state, trace-evidenced hypotheses, and mapped repairs before editing')
 write(R/'materials'/args.version/'repair-plan.json',{**a,'recorded_at':time.time(),'interpretation':'Hypotheses, not established causes'})
elif args.action=='evaluate':evaluate(args.version,args.split)
elif args.action=='report':print(json.dumps(report(args.version),ensure_ascii=False))
elif args.action=='decide':
 if args.adopt==args.reject:raise ValueError('Choose --adopt or --reject')
 decide(args.version,args.adopt,args.reason)
else:finish()
