"""Transfer a predeclared released Harness-R1 patch to shared Qwen3-4B DBBench."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
from collections import defaultdict
from typing import Any,Dict,List,Optional
import ast,copy,json,sys,time,re,statistics,threading,importlib.util,urllib.request,os
R=Path(os.environ.get('COMPETITOR_RUN_ROOT',Path(__file__).resolve().parent));D=Path(os.environ.get('AUTOHARNESS_EXPERIMENT_ROOT',R.parent));OUT=R/'jobs/harness-r1-dbbench';OUT.mkdir(parents=True,exist_ok=True);S=R/'sources/harness-r1'
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
ENVROOT=D/'dbbench-methods-20r-20261023';envmod=load('common_db_environment',ENVROOT/'db_environment.py');harness=load('r1_db_harness',S/'dbbench.py');hooks=load('r1_code_runner',S/'code_runner.py');ns=dict(Any=Any,Dict=Dict,List=List,Optional=Optional,DBBenchHarnessRuntime=harness.DBBenchHarnessRuntime)
tree=ast.parse((S/'task.py').read_text());ctxfn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_dbbench_code_context');exec(compile(ast.Module(body=[ctxfn],type_ignores=[]),'released_db_context','exec'),ns);context=ns['_dbbench_code_context'];PATCH=json.loads((S/'patch.json').read_text());compiled=defaultdict(list)
for action in PATCH['actions']:compiled[action['hook']].append(hooks.compile_hook(action['code'],benchmark='dbbench'))
TASKS=[json.loads(s) for s in (ENVROOT/'life-harness/test.jsonl').open() if s.strip()];LOCK=threading.Lock()
def save(p,d):
 t=p.with_suffix('.tmp');t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');t.replace(p)
def post(url,body):
 req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Qwen-Experiment':'competitor-harness-r1-dbbench-20261102'})
 with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=240) as resp:return json.load(resp)
def records():
 out={};p=OUT/'episodes.jsonl'
 if p.exists():
  for s in p.open():
   x=json.loads(s)
   if x.get('valid'):out[(x['task_id'],x['trial'],x['seed'])]=x
 return out

def episode(task):
 env=envmod.Environment({});runtime=harness.DBBenchHarnessRuntime(harness.DBBenchHarnessConfig(enabled=False));nb={};usage=[];start=time.time();tracefile=OUT/'traces'/(task['task_id']+f"-{task['trial']}.jsonl");tracefile.parent.mkdir(parents=True,exist_ok=True);activity=defaultdict(int)
 def trace(x):
  with tracefile.open('a') as f:f.write(json.dumps(x,ensure_ascii=False)+'\n')
 def apply(name,**kw):
  ctx=context(runtime,**kw);result=[]
  for fn in compiled.get(name,[]):
   out=hooks.run_hook(fn,ctx,nb,hook_name=name);activity[name]+=1;trace(dict(type='code_hook',hook=name,result=out,notebook=copy.deepcopy(nb)))
   if out:result.append(out)
  return result
 row=dict(task_id=task['task_id'],trial=task['trial'],seed=task['seed']);score=0;reason='model_call_budget'
 try:
  first=env.reset(task['task_id'],task['seed'],'test');runtime.init_task(first['task_context']);system=first['system_prompt']
  for out in apply('on_init',remaining_rounds=15,round_num=0):
   skills=[x['text'] for x in out.get('skills',[]) if x.get('text')]
   if skills:system+='\n\nSome tips that may help for this task:\n'+'\n'.join('- '+x for x in skills)
   if out.get('tool_hint'):system+='\n\nAdditional reusable tool-use hint from the harness:\n'+out['tool_hint']
  messages=[dict(role='system',content=system),dict(role='user',content=first['observation'])]
  for step in range(15):
   if time.time()-start>1500:reason='episode_timeout';break
   for out in apply('make_pre_hint',remaining_rounds=15-step,round_num=step+1):
    if out.get('message'):messages.append(dict(role='user',content=out['message']))
   counted=post('http://127.0.0.1:18086/tokenize',dict(model='Qwen3-4B-Instruct-2507',messages=messages,tools=first['tools'],add_generation_prompt=True))['count']
   if counted+4096+256>32768:reason='context_limit';break
   body=dict(model='Qwen3-4B-Instruct-2507',messages=messages,tools=first['tools'],tool_choice='auto',temperature=0,max_tokens=4096,parallel_tool_calls=False,chat_template_kwargs={'enable_thinking':False})
   for attempt in range(3):
    try:trace(dict(type='request',at=time.time(),body=body));response=post('http://127.0.0.1:18039/v1/chat/completions',body);trace(dict(type='response',at=time.time(),response=response));break
    except Exception:
     if attempt==2:raise
   usage.append(response.get('usage',{}));reply=response['choices'][0]['message'];reply={k:v for k,v in reply.items() if k in ['role','content','tool_calls'] and v is not None};calls=reply.get('tool_calls') or []
   if calls:reply['tool_calls']=calls[:1]
   messages.append(reply)
   if not calls:runtime.note_text_only_turn();messages.append(dict(role='user',content='No executable tool calls found. Please call a tool.'));continue
   runtime.reset_text_only_streak();call=calls[0];name=call['function']['name'];args=json.loads(call['function'].get('arguments') or '{}')
   if not isinstance(args,dict):reason='malformed_tool_arguments';break
   sql=args.get('query','');answers=args.get('answers',[]);blocked=False
   for out in apply('on_before_action',tool_name=name,sql=sql,answers=answers,remaining_rounds=15-step,round_num=step+1):
    if out.get('kind')=='block_and_prompt':messages.append(dict(role='tool',tool_call_id=call['id'],content=out['message']));blocked=True;break
   if blocked:continue
   z=env.step(name,args);score=z['score'];trace(dict(type='environment_result',tool=name,args=args,result=z))
   if name=='execute_sql':runtime.update_state_after_sql(sql,z['observation'])
   messages.append(dict(role='tool',tool_call_id=call['id'],content=z['observation']))
   for out in apply('on_post_step',tool_name=name,sql=sql,answers=answers,db_response=z['observation'],remaining_rounds=14-step,round_num=step+1):
    if out.get('kind')=='inject_hint' and out.get('message'):messages.append(dict(role='user',content=out['message']))
   if z['done']:reason='environment_done';break
  row.update(valid=True,score=score,termination_reason=reason)
 except Exception as exc:row.update(valid=False,error=type(exc).__name__+': '+str(exc)[:200])
 finally:
  try:env.close()
  except Exception:pass
 row.update(model_calls=len(usage),input_tokens=sum(u.get('prompt_tokens',0) for u in usage),output_tokens=sum(u.get('completion_tokens',0) for u in usage),hook_calls=dict(activity),elapsed_seconds=time.time()-start)
 with LOCK:
  with (OUT/'episodes.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
 return row

save(OUT/'protocol.json',dict(method='Harness-R1 released DBBench patch',paper='https://arxiv.org/abs/2608.02276',source='https://github.com/DeepExperience/Harness-R1/blob/main/examples/heldout_generalization/harness-r1/seed20260720/dbbench.json',benchmark='dbbench',executor='Qwen3-4B-Instruct-2507',task_manifest=TASKS,repeats=3,expected_episodes=900,model_calls=15,max_output_tokens=4096,context_tokens=32768,optimizer_calls=0,new_engineer_model=False,test_feedback_to_optimizer=False,selection='First released engineer seed20260720, fixed before our evaluation; no selection by our test scores.',runtime='Released hook compiler, runner, DB state updater and code-context builder; built-in Life-Harness H2-H5 disabled. Shared database initialization and grading.'))
for attempt in range(3):
 seen=records();pending=[t for t in TASKS if (t['task_id'],t['trial'],t['seed']) not in seen]
 if not pending:break
 with ThreadPoolExecutor(max_workers=6) as ex:
  fs=[ex.submit(episode,t) for t in pending];done=len(seen)
  for f in as_completed(fs):
   x=f.result();done+=int(x['valid']);save(OUT/'progress.json',dict(updated_at=time.time(),valid=done,expected=900,attempt=attempt,last_outcome={k:x.get(k) for k in ['valid','score','termination_reason','error','hook_calls']}))
seen=records();by=defaultdict(list)
for x in seen.values():by[str(x['trial'])].append(x['score'])
rates={k:statistics.mean(v) for k,v in by.items() if len(v)==300};complete=len(seen)==900 and len(rates)==3
save(OUT/'summary.json',dict(method='Harness-R1 released DBBench patch',benchmark='dbbench',complete=complete,valid_episodes=len(seen),expected_episodes=900,repeat_rates=rates,mean=statistics.mean(rates.values()) if complete else None,sample_std=statistics.stdev(rates.values()) if complete else None,sample_variance=statistics.variance(rates.values()) if complete else None,input_tokens=sum(x.get('input_tokens',0) for x in seen.values()),output_tokens=sum(x.get('output_tokens',0) for x in seen.values()),model_calls=sum(x.get('model_calls',0) for x in seen.values()),finished_at=time.time()));raise SystemExit(0 if complete else 1)
