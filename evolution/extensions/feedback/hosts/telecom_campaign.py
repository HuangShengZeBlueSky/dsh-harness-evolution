"""Mechanical copying, visible trace projection and evaluation summaries only."""
from pathlib import Path
from collections import Counter
import json,shutil,sys,subprocess,yaml
R=Path(__file__).resolve().parent
NODE=__import__('os').environ.get('DSH_NODE', 'node')
def read(p):return json.loads(Path(p).read_text())
def write(p,d):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def materials(parent,out):
 out=Path(out);out.mkdir(parents=True,exist_ok=True);index=[]
 for i,p in enumerate(sorted((Path(parent)/'train').glob('trial-*/*--t*.json'))):
  raw=read(p);messages=[]
  for j,m in enumerate(raw['messages']):
   role=m.get('role')
   if role not in ['user','assistant','tool','system'] or (role in ['tool','assistant'] and m.get('requestor') not in ['assistant',None]):continue
   if role=='user' and not m.get('content'):continue
   item={'index':j,**{k:m[k] for k in ['role','content','tool_call_id','id','requestor','error'] if k in m}}
   if role=='assistant':item['tool_calls']=m.get('tool_calls') or []
   messages.append(item)
  key=f'E{i+1:03d}';trace=out/'traces'/(key+'.json');success=raw['reward_info']['reward']==1
  write(trace,{'episode_id':key,'success':success,'trial':raw['trial'],'messages':messages})
  ending=[m for m in messages if m['role'] in ['assistant','user'] and m.get('content')][-4:]
  index.append({'episode_id':key,'success':success,'trace':str(trace),'ending':[{'index':m['index'],'role':m['role'],'content':str(m['content'])[:700]} for m in ending]})
  if i==0:(out/'policy.txt').write_text(raw.get('policy',''))
 write(out/'failure-index.json',{'total':len(index),'failures':[x for x in index if not x['success']],'successful_references':[x for x in index if x['success']]})
 return len(index)
def prepare(v,parent):
 parent=Path(parent);out=R/'runs'/f'v{int(v):02d}'
 if out.exists():raise ValueError('Candidate already exists; continue its existing files')
 shutil.copytree(parent,out,symlinks=True,ignore=shutil.ignore_patterns('train','test','dsh','sessions','home','__pycache__','*.log','status.json','process.json','summary.json','launch.json','provenance.json','materials','funnel.json','reflection.txt','runtime-evidence.json'))
 comp=read(out/'composition.json');comp.update(parent=str(parent),version=int(v))
 for m in comp['methods']:m['module']=str(out/'plugins'/Path(m['module']).name)
 write(out/'composition.json',comp)
 materials(parent,R/'rounds'/f'v{int(v):02d}'/'materials')
 print(out)
def freeze(run):
 run=Path(run);comp=read(run/'composition.json');methods=[m for m in comp['methods'] if m['id'] in comp.get('selected',[x['id'] for x in comp['methods']])]
 
 for m in methods:
  m['module']=str(run/'plugins'/Path(m['module']).name)
  subprocess.run([NODE,'--check',m['module']],check=True)
 profile=yaml.safe_load((run/'profile-template.yml').read_text());entries=[e for e in profile[0]['insert'] if not e['id'].startswith('custom-')]
 for e in entries:
  if e['id']=='tau2-h0':e['name']=str(run/'bridge/index.mjs');e['config'].update(workspace=str(run),methods=methods)
 for i,m in enumerate(methods):entries.append({'id':f'custom-{i}','name':m['module'],'config':m.get('config',{})})
 profile[0]['insert']=entries;(run/'profile-template.yml').write_text(yaml.safe_dump(profile,sort_keys=False));comp['methods']=methods;write(run/'composition.json',comp)
 parent=Path(comp['parent']);source=(R/'summarize-template.py').read_text().splitlines()
 source=[f"BASE={{'train':Path({str(parent/'train')!r}),'test':Path(__import__('os').environ['DSH_TELECOM_H0_TEST'])}}" if l.startswith('BASE=') else l for l in source]
 # The historical H0 test directory is flat, handled only in final test reporting.
 source=[l.replace('base=read_rows(BASE[split],True)','base=read_rows(BASE[split],split==\'train\')') for l in source]
 (run/'summarize.py').write_text('\n'.join(source)+'\n');print('Frozen',len(methods),'plugins')
def evidence(run):
 run=Path(run);ids=[m['id'] for m in read(run/'composition.json')['methods']];result={ident:{'loaded':0,'events':0,'sessions':0,'request_hits':0,'prompt_text_request_hits':0,'control_reason_request_hits':0,'state_updates':0,'denied_audit_events':0,'allowed_audit_events':0,'examples':[]} for ident in ids}
 completed_sessions=set()
 for split in ['train','test']:
  for p in (run/split).glob('trial-*/*--t*.json'):
   try:
    sid=read(p).get('dsh_session_id')
    if sid:completed_sessions.add(sid)
   except (json.JSONDecodeError,OSError):
    continue
 session_dirs=sorted(p for p in (run/'dsh').glob('*') if p.is_dir())
 unmatched_sessions=[p.name for p in session_dirs if p.name not in completed_sessions]
 for f in sorted(run.glob('dsh/*/activations.jsonl')):
  if f.parent.name not in completed_sessions:continue
  es=[json.loads(l) for l in f.read_text().splitlines() if l.strip()];q=f.with_name('requests.jsonl');req=[json.loads(l) for l in q.read_text().splitlines() if l.strip()] if q.exists() else []
  for ident in ids:
   all_es=[e for e in es if e.get('method_id')==ident];active=[e for e in all_es if e.get('hook')!='loaded'];s=result[ident];s['loaded']+=len(all_es)-len(active);s['events']+=len(active);s['sessions']+=bool(active)
   s['denied_audit_events']+=sum(e.get('decision') in ['deny','deny_once'] for e in active);s['allowed_audit_events']+=sum(e.get('decision')=='allow' for e in active);s['state_updates']+=sum(e.get('decision') in ['gate_armed','state_update'] for e in active)
   prompt_texts={e[k] for e in active for k in ['text','instructions','summary'] if isinstance(e.get(k),str) and e[k]}
   control_texts={e[k] for e in active if e.get('decision') in ['deny','deny_once'] for k in ['annotation','reason'] if isinstance(e.get(k),str) and e[k]}
   hits=[];prompt_hits=[];control_hits=[]
   def strings(x):
    if isinstance(x,str):yield x
    elif isinstance(x,dict):
     for y in x.values():yield from strings(y)
    elif isinstance(x,list):
     for y in x:yield from strings(y)
   for ri,qrow in enumerate(req):
    vals=list(strings(qrow.get('body',{})))
    match={'request_line':ri+1,'step':qrow.get('step'),'request_index':qrow.get('request_index')}
    prompt_match=any(t in val for val in vals for t in prompt_texts)
    control_match=any(t in val for val in vals for t in control_texts)
    if prompt_match:prompt_hits.append(match)
    if control_match:control_hits.append(match)
    if prompt_match or control_match:hits.append(match)
   s['request_hits']+=len(hits);s['prompt_text_request_hits']+=len(prompt_hits);s['control_reason_request_hits']+=len(control_hits)
   if active and len(s['examples'])<3:s['examples'].append({'session':f.parent.name,'activation_file':str(f),'request_file':str(q),'events':active[:3],'matching_requests':hits[:3]})
 write(run/'runtime-evidence.json',{'plugins':result,'completed_result_sessions':len(completed_sessions),'unmatched_session_directories':unmatched_sessions,'meaning':'Only sessions referenced by completed result files are counted. Non-load audit events are self-reported; prompt_text_request_hits independently checks injected text in real model requests. control_reason_request_hits separately counts denial annotation/reason visible in requests. Deny audits still require trace/control receipt verification; rewards require paired trace review.'})
 print(json.dumps({k:{n:v for n,v in x.items() if n!='examples'} for k,x in result.items()},ensure_ascii=False))
if __name__=='__main__':
 cmd,*args=sys.argv[1:]
 if cmd=='prepare':prepare(*args)
 elif cmd=='freeze':freeze(*args)
 elif cmd=='materials':print(materials(*args))
 elif cmd=='runtime':evidence(*args)
 else:raise ValueError(cmd)
