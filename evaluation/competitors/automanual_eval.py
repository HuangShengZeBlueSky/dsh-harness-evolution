"""Released AutoManual rules, skills and original planner, shared ALFWorld tasks."""
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor,as_completed
from collections import defaultdict
from types import SimpleNamespace,ModuleType
from copy import copy
import json,sys,time,re,os,ast,urllib.request,statistics,importlib.util,signal,multiprocessing
R=Path(os.environ.get('COMPETITOR_RUN_ROOT',Path(__file__).resolve().parent));D=Path(os.environ.get('AUTOHARNESS_EXPERIMENT_ROOT',R.parent));SRC=R/'sources/automanual';BASE=D/'alfworld-final-headtohead-20261023';OUT=R/'jobs/automanual';OUT.mkdir(parents=True,exist_ok=True)
def save(p,d):
 t=p.with_suffix('.tmp');t.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');t.replace(p)
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);sys.modules[name]=m;spec.loader.exec_module(m);return m
def run_episode(task):
 began=time.time();usages=[];tracefile=OUT/'traces'/(task['task_id']+f"-{task['trial']}.jsonl");tracefile.parent.mkdir(parents=True,exist_ok=True)
 def trace(z):
  with tracefile.open('a') as f:f.write(json.dumps(z,ensure_ascii=False)+'\n')
 def post(url,body):
  req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Qwen-Experiment':'competitors-automanual-20261102'})
  with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=240) as resp:return json.load(resp)
 def create(**body):
  body.update(model='Qwen3-4B-Instruct-2507',seed=task['seed'],top_p=.8,top_k=20,chat_template_kwargs={'enable_thinking':False});body.pop('tools',None)
  for attempt in range(3):
   try:trace(dict(type='model_request',at=time.time(),body=body));x=post(os.environ.get('SOLVER_ENDPOINT','http://127.0.0.1:18039/v1/chat/completions'),body);trace(dict(type='model_response',at=time.time(),response=x));break
   except Exception:
    if attempt==2:raise
  u=x.get('usage',{});usages.append(u);return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=x['choices'][0]['message'].get('content')))],usage=SimpleNamespace(total_tokens=u.get('total_tokens',0),prompt_tokens=u.get('prompt_tokens',0),completion_tokens=u.get('completion_tokens',0)))
 class ProviderClient:
  def __init__(self):self.chat=SimpleNamespace(completions=SimpleNamespace(create=create))
 class ProviderTokenizer:
  def encode(self,text):return range(post(os.environ.get('TOKENIZER_ENDPOINT','http://127.0.0.1:18086/tokenize'),dict(model='Qwen3-4B-Instruct-2507',messages=[dict(role='user',content=text)],add_generation_prompt=True))['count'])
 ns=dict(os=os,re=re,json=json,time=time,copy=copy,openai=SimpleNamespace(OpenAI=ProviderClient),tiktoken=SimpleNamespace(get_encoding=lambda _:ProviderTokenizer()))
 tree=ast.parse((SRC/'provider-source-ChatGPT_API.py').read_text());node=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='ChatGPT_Agent');exec(compile(ast.Module(body=[node],type_ignores=[]),str(SRC/'provider-source-ChatGPT_API.py'),'exec'),ns)
 agentclass=ns['ChatGPT_Agent']
 def get_prompt(self,prompt):
  messages=self.prompt_messages+prompt;n=post(os.environ.get('TOKENIZER_ENDPOINT','http://127.0.0.1:18086/tokenize'),dict(model='Qwen3-4B-Instruct-2507',messages=messages,add_generation_prompt=True))['count']
  if n+self.max_completion_length>32768:raise ValueError('context limit')
  return messages
 agentclass.get_prompt=get_prompt
 api=ModuleType('OpenAI_Agent_API');apins=dict(re=re,ChatGPT_Agent=agentclass,ChatGPT_Agent_Assistant_API=None)
 tree=ast.parse((SRC/'provider-source-__init__.py').read_text());exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'provider adapter','exec'),apins);api.get_ChatGPT_Agent=apins['get_ChatGPT_Agent'];api.process_respond=apins['process_respond'];sys.modules['OpenAI_Agent_API']=api
 sys.path.insert(0,str(SRC));sys.path.insert(0,str(SRC/'prompts'));envmod=module('env_history',SRC/'env_history.py')
 ns=dict(os=os,re=re,json=json,ast=ast);tree=ast.parse((SRC/'autobuild_utils.py').read_text());nodes=[n for n in tree.body if (isinstance(n,ast.FunctionDef) and n.name=='define_functions_from_code') or (isinstance(n,ast.ClassDef) and n.name=='Rule_Manager')];exec(compile(ast.Module(body=nodes,type_ignores=[]),'released rules','exec'),ns)
 rules=ns['Rule_Manager']({});rules.load(str(SRC));skills=json.loads((SRC/'skill_bank.json').read_text())
 class ExactTaskTypeSkills:
  def get_relevant_skill(self,task_type,local_scope):
   s=skills[task_type];ns['define_functions_from_code'](s['skill_code'],local_scope)
   return f"\nHere is the code for a relevant skill:\n{s['init_obs']}\nThe task is to: {s['task_name']}\n```python\n{s['skill_code']}\n```\nPlease pay close attention to the process and details of this successful code when writing code. Also, be aware of potential randomness (the current environment may differ from this one)."
 native=module('common_alfworld',BASE/'environment.py').Environment(dict(data_root=str(D/'alfworld-official50-20r-20261022/data/json_2.1.1'),h2_prevalidated=True,system_prompt_file=str(BASE/'system-prompt.txt')))
 def normalize(text):return re.sub(r'\b(?:a|an|the) (?=[A-Za-z]+_\d+)', '',re.sub(r'\b([A-Za-z]+) (\d+)\b',r'\1_\2',text))
 class PublicEnvironment:
  def step(self,actions):
   action=re.sub(r'_([0-9]+)\b',r' \1',actions[0]);z=native.step('take_action',dict(action=action));trace(dict(type='environment_result',action=action,result=z));return [normalize(z['observation'])],z['score'],[z['done']],{'won':[bool(z['score'])]}
 result=dict(task_id=task['task_id'],trial=task['trial'],seed=task['seed']);wrapped=None
 def expire(*args):raise TimeoutError('episode budget')
 signal.signal(signal.SIGALRM,expire);signal.alarm(1500)
 try:
  first=native.reset(task['task_id'],task['seed'],'test');obs=normalize(first['observation'].split(' AVAILABLE ACTIONS:',1)[0]);wrapped=envmod.InteractEnv(PublicEnvironment(),0,task['task_id'].split('/')[-2],0,obs);runner=module('released_test_trial',SRC/'test_trial.py');os.chdir(SRC)
  success,step,cost=runner.run(SimpleNamespace(agent_type='autobuild_case',simple_example=True,model_name='Qwen3-4B-Instruct-2507',assistant_api=False),wrapped,rules,ExactTaskTypeSkills());result.update(valid=True,score=float(success),termination_reason='environment_done' if wrapped.done else 'replan_budget')
 except TimeoutError:result.update(valid=True,score=float(wrapped.reward) if wrapped else 0,termination_reason='episode_timeout')
 except ValueError as exc:
  # Original planner-format errors are task behavior, not provider failure.
  if 'LLM failed to respond' in str(exc):result.update(valid=True,score=0,termination_reason='planner_format')
  else:result.update(valid=False,error=type(exc).__name__+': '+str(exc)[:200])
 except Exception as exc:result.update(valid=False,error=type(exc).__name__+': '+str(exc)[:200])
 finally:
  signal.alarm(0)
  try:native.close()
  except Exception:pass
 result.update(input_tokens=sum(x.get('prompt_tokens',0) for x in usages),output_tokens=sum(x.get('completion_tokens',0) for x in usages),model_calls=len(usages),elapsed_seconds=time.time()-began,environment_actions=getattr(wrapped,'action_step',0));return result

def main():
 tasks=json.loads((BASE/'test-tasks.json').read_text());skills=json.loads((SRC/'skill_bank.json').read_text());types={t['task_id'].split('/')[-2].split('-')[0] for t in tasks};assert types<=skills.keys(),'Released skill coverage mismatch'
 save(OUT/'protocol.json',dict(method='AutoManual released manual and planner',source_url='https://github.com/minghchen/automanual',benchmark='alfworld',executor='Qwen3-4B-Instruct-2507',task_manifest=tasks,expected_episodes=327,repeats=3,planner_calls=5,max_output_tokens=2000,max_environment_actions=50,concurrency=6,additional_models=[],optimizer_calls=0,test_feedback_to_optimizer=False,adapter_notes=['Original released Agent, InteractEnv, planner prompt/example, Rule_Manager and test_trial.run.','Underscore object identifiers mapped mechanically to shared native action identifiers.','All six task types exactly match released skill keys; use exact-key lookup instead of embedding self-match.','Qwen provider and tokenizer replace OpenAI model-specific transport.']))
 for attempt in range(3):
  seen={}
  if (OUT/'episodes.jsonl').exists():
   for s in (OUT/'episodes.jsonl').open():
    z=json.loads(s)
    if z.get('valid'):seen[(z['task_id'],z['trial'],z['seed'])]=z
  pending=[t for t in tasks if (t['task_id'],t['trial'],t['seed']) not in seen]
  if not pending:break
  with ProcessPoolExecutor(max_workers=6,mp_context=multiprocessing.get_context('spawn')) as ex:
   fs=[ex.submit(run_episode,t) for t in pending];done=len(seen)
   for f in as_completed(fs):
    x=f.result();done+=int(x['valid'])
    with (OUT/'episodes.jsonl').open('a') as out:out.write(json.dumps(x,ensure_ascii=False)+'\n')
    save(OUT/'progress.json',dict(valid=done,expected=327,updated_at=time.time(),attempt=attempt,last_outcome={k:x.get(k) for k in ['valid','score','termination_reason','error']}))
 by=defaultdict(list);seen={}
 for line in (OUT/'episodes.jsonl').open():
  x=json.loads(line)
  if x.get('valid'):seen[(x['task_id'],x['trial'],x['seed'])]=x
 for x in seen.values():by[str(x['trial'])].append(x['score'])
 rates={k:statistics.mean(v) for k,v in by.items() if len(v)==109};complete=len(seen)==327 and len(rates)==3
 save(OUT/'summary.json',dict(method='AutoManual released manual and planner',benchmark='alfworld',complete=complete,valid_episodes=len(seen),expected_episodes=327,repeat_rates=rates,mean=statistics.mean(rates.values()) if complete else None,sample_std=statistics.stdev(rates.values()) if complete else None,sample_variance=statistics.variance(rates.values()) if complete else None,model_calls=sum(x.get('model_calls',0) for x in seen.values()),input_tokens=sum(x.get('input_tokens',0) for x in seen.values()),output_tokens=sum(x.get('output_tokens',0) for x in seen.values()),finished_at=time.time()));raise SystemExit(0 if complete else 1)
if __name__=='__main__':main()
