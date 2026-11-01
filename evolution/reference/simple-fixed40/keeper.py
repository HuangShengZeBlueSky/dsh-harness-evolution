"""One persistent optimizer per authorized group; real evaluation remains native."""
from pathlib import Path
import os,sys,json,time,subprocess,fcntl,yaml
CFG=Path(sys.argv[1]).resolve();BASE=CFG.parent;C=yaml.safe_load(CFG.read_text());ROOT=Path(__file__).resolve().parent;RUN=BASE/'runs';RUN.mkdir(exist_ok=True)
manifest=json.loads((ROOT/'manifest.json').read_text());assert str(BASE) in {g['path'] for g in manifest['groups']}
def write(p,x):q=p.with_suffix('.tmp');q.write_text(json.dumps(x,ensure_ascii=False,indent=2));q.replace(p)
def state(phase,**kw):write(BASE/'worker-status.json',dict(phase=phase,updated_at=time.time(),**kw))
lock=(RUN/'keeper.lock').open('a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
base_source=Path(C['baseline_shared']);state('waiting_for_shared_baseline')
while not (base_source/'runs/baseline-ready.json').exists():time.sleep(10)
if not (RUN/'baseline-imported.json').exists():
 if C.get('engine')=='telecom':
  target=BASE/'baseline/train'
  if not target.exists():target.symlink_to(base_source/'baseline/train',target_is_directory=True)
 else:
  dest=RUN/'evaluations/baseline';dest.mkdir(parents=True,exist_ok=True)
  (dest/'train').mkdir(exist_ok=True)
  if not (dest/'train/episodes.jsonl').exists():(dest/'train/episodes.jsonl').symlink_to(base_source/'runs/evaluations/baseline/train/episodes.jsonl')
 subprocess.run([sys.executable,'experiment.py','evaluate','baseline','--split','train'],cwd=BASE,check=True)
 write(RUN/'baseline-imported.json',{'source':str(base_source),'same_actor_tasks_runtime':True})
failures=0;turn=max([int(p.name.split('-')[1]) for p in RUN.glob('turn-*-events.jsonl')],default=0)
while not (RUN/'completed.txt').exists():
 sid=(RUN/'session.txt').read_text().strip() if (RUN/'session.txt').exists() else None
 turn+=1;opt=C['optimizer'];cmd=opt['command']+['exec','--sandbox','danger-full-access','-c','approval_policy="never"','-c','model_reasoning_effort='+json.dumps(opt['effort'])]
 if sid:cmd+=['resume']
 cmd+=['--json','--skip-git-repo-check','--model',opt['model'],'--output-last-message',str(RUN/f'turn-{turn:03d}-reply.txt')]+([sid] if sid else [])+['-']
 prompt=(BASE/('continue-prompt.txt' if sid else 'START_PROMPT.md')).read_text();state('optimizer_running',model=opt['model'],effort=opt['effort'],turn=turn)
 failed=False
 with (RUN/f'turn-{turn:03d}-events.jsonl').open('a') as log,(RUN/f'turn-{turn:03d}-stderr.txt').open('a') as err:
  p=subprocess.Popen(cmd,cwd=BASE,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True)
  p.stdin.write(prompt);p.stdin.close()
  for line in p.stdout:
   log.write(line);log.flush()
   try:e=json.loads(line)
   except ValueError:continue
   if e.get('type')=='thread.started':sid=e['thread_id'];(RUN/'session.txt').write_text(sid+'\n')
   if e.get('type')=='turn.failed':failed=True
  code=p.wait()
 if code or failed or not sid:
  failures+=1;state('optimizer_retry',failures=failures,exit_code=code)
  if failures>=3:raise SystemExit('Optimizer failed three turns; preserve results and resume through service retry')
  time.sleep(30)
 else:failures=0;time.sleep(3)
state('complete')
