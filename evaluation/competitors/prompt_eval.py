"""Paper-prompt transfer to frozen Qwen3-4B on the shared ALFWorld test set."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from collections import defaultdict
import json,sys,time,re,urllib.request,threading,statistics,importlib.util,os
R=Path(os.environ.get('COMPETITOR_RUN_ROOT',Path(__file__).resolve().parent));D=Path(os.environ.get('AUTOHARNESS_EXPERIMENT_ROOT',R.parent));METHOD=sys.argv[1];OUT=R/'jobs'/METHOD;OUT.mkdir(parents=True,exist_ok=True)
BASE=D/'alfworld-final-headtohead-20261023';spec=importlib.util.spec_from_file_location('common_alfworld',BASE/'environment.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
PROMPT=json.loads((R/'sources'/(METHOD+'-prompt.json')).read_text());TASKS=json.loads((BASE/'test-tasks.json').read_text());LOCK=threading.Lock()
def save(p,d):
 t=p.with_suffix('.tmp');t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');t.replace(p)
def post(url,data):
 req=urllib.request.Request(url,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-Qwen-Experiment':'competitors-'+METHOD+'-20261102'})
 with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=240) as resp:return json.load(resp)
def rows():
 p=OUT/'episodes.jsonl';seen={}
 if p.exists():
  for s in p.open():
   z=json.loads(s)
   if z.get('valid'):seen[(z['task_id'],z['trial'],z['seed'])]=z
 return seen
def run(task):
 env=m.Environment(dict(data_root=str(D/'alfworld-official50-20r-20261022/data/json_2.1.1'),h2_prevalidated=True,system_prompt_file=str(BASE/'system-prompt.txt')));began=time.time();log=OUT/'traces'/(task['task_id']+f"-{task['trial']}.jsonl");log.parent.mkdir(parents=True,exist_ok=True);usages=[];actions=[]
 def trace(x):
  with log.open('a') as f:f.write(json.dumps(x,ensure_ascii=False)+'\n')
 record=dict(task_id=task['task_id'],trial=task['trial'],seed=task['seed'])
 try:
  first=env.reset(task['task_id'],task['seed'],'test');messages=[dict(role='system',content=PROMPT['instruction']+'\n\nExamples:\n\n'+'\n\n'.join(PROMPT['examples'])),dict(role='user',content=first['observation'])];score=0;reason='model_call_budget'
  for turn in range(50):
   if time.time()-began>1500:reason='episode_timeout';break
   counted=post(os.environ.get('TOKENIZER_ENDPOINT','http://127.0.0.1:18086/tokenize'),dict(model='Qwen3-4B-Instruct-2507',messages=messages,add_generation_prompt=True))['count']
   if counted+4096>32768:reason='context_limit';break
   body=dict(model='Qwen3-4B-Instruct-2507',messages=messages,temperature=0,max_tokens=4096,seed=task['seed'],top_p=.8,top_k=20,chat_template_kwargs={'enable_thinking':False})
   for attempt in range(3):
    try:
     trace(dict(type='model_request',at=time.time(),body=body));response=post(os.environ.get('SOLVER_ENDPOINT','http://127.0.0.1:18039/v1/chat/completions'),body);trace(dict(type='model_response',at=time.time(),response=response));break
    except Exception:
     if attempt==2:raise
   usages.append(response.get('usage',{}));reply=response['choices'][0]['message'];text=reply.get('content') or '';messages.append(dict(role='assistant',content=text));found=re.search(r'(?:^|\n)\s*Action\s*:\s*(.+)',text,re.I)
   if not found:messages.append(dict(role='user',content='Please output one Action: followed by the next environment action.'));continue
   action=found.group(1).strip().strip('`');z=env.step('take_action',{'action':action});actions.append(z.get('executed_action',action));score=z['score'];trace(dict(type='environment_result',action=action,result=z));messages.append(dict(role='user',content='Observation: '+z['observation']))
   if z['done']:reason='environment_done';break
   if len(actions)>3 and len(set(actions[-3:]))==1:reason='repeated_action';break
  record.update(valid=True,score=score,termination_reason=reason,model_calls=len(usages),environment_actions=len(actions),input_tokens=sum(u.get('prompt_tokens',0) for u in usages),output_tokens=sum(u.get('completion_tokens',0) for u in usages),elapsed_seconds=time.time()-began)
 except Exception as exc:record.update(valid=False,error=type(exc).__name__+': '+str(exc)[:200],elapsed_seconds=time.time()-began)
 finally:
  try:env.close()
  except Exception:pass
 with LOCK:
  with (OUT/'episodes.jsonl').open('a') as f:f.write(json.dumps(record,ensure_ascii=False)+'\n')
 return record
save(OUT/'protocol.json',dict(method=PROMPT['method'],benchmark='alfworld',source_url=PROMPT['source'],artifact='paper instructions and two appendix demonstrations',executor='Qwen3-4B-Instruct-2507',setting='Original text-action reasoning policy; shared native game interface. Cross-executor prompt transfer; not original paper numbers.',task_manifest=[{k:t[k] for k in ['task_id','trial','seed']} for t in TASKS],test_tasks=109,repeats=3,expected=327,max_model_calls=50,max_tokens=4096,max_context_tokens=32768,max_episode_seconds=1500,episode_concurrency=6,additional_models=[],test_feedback_to_optimizer=False,optimizer_calls=0))
for attempt in range(3):
 seen=rows();pending=[x for x in TASKS if (x['task_id'],x['trial'],x['seed']) not in seen]
 if not pending:break
 with ThreadPoolExecutor(max_workers=6) as executor:
  futures=[executor.submit(run,t) for t in pending];done=len(seen)
  for f in as_completed(futures):
   z=f.result();done+=int(z['valid']);save(OUT/'progress.json',dict(updated_at=time.time(),valid=done,expected=327,attempt=attempt,last_outcome={k:z.get(k) for k in ['valid','score','termination_reason','error']}))
seen=rows();by=defaultdict(list)
for x in seen.values():by[str(x['trial'])].append(x['score'])
rates={k:statistics.mean(v) for k,v in by.items() if len(v)==109};complete=len(seen)==327 and len(rates)==3
summary=dict(method=PROMPT['method'],benchmark='alfworld',complete=complete,valid_episodes=len(seen),expected_episodes=327,repeat_rates=rates,mean=statistics.mean(rates.values()) if complete else None,sample_std=statistics.stdev(rates.values()) if complete else None,sample_variance=statistics.variance(rates.values()) if complete else None,input_tokens=sum(x.get('input_tokens',0) for x in seen.values()),output_tokens=sum(x.get('output_tokens',0) for x in seen.values()),model_calls=sum(x.get('model_calls',0) for x in seen.values()),elapsed_seconds=sum(x.get('elapsed_seconds',0) for x in seen.values()),finished_at=time.time(),selection='frozen paper prompt; no training/search on our test tasks')
save(OUT/'summary.json',summary);print(json.dumps(summary),flush=True);raise SystemExit(0 if complete else 1)
