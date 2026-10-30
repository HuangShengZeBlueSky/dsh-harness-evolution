"""DBBench adapter: released database initialization, execution and grader, MySQL 8."""
import ast,asyncio,copy,json,logging,sys,types,uuid,os
from pathlib import Path
from typing import *
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'deps'))
SOURCE=ROOT/'source/AgentBench/src/server/tasks/dbbench'
class Delegation:
 def __init__(self,password=''):self.password=password
class Controller:
 def __init__(self,config):
  self.delegation=Delegation(os.environ.get(config.get('mysql_password_env','MYSQL_PASSWORD'),''));self.port=config.get('mysql_port',13316);self.hostname=config.get('mysql_host','127.0.0.1')
 async def start_session(self,kind):
  sid=str(uuid.uuid4());return sid,{kind:sid},{kind:self.hostname}
 async def end_session(self,sid):pass

def load(name,path,extra,skip):
 module=types.ModuleType(name);module.__file__=str(path);sys.modules[name]=module;module.__dict__.update(extra)
 tree=ast.parse(path.read_text());tree.body=[n for n in tree.body if not(isinstance(n,ast.ImportFrom) and skip(n))]
 exec(compile(tree,str(path),'exec'),module.__dict__);return module
interaction=load('db_original_interaction',SOURCE/'interaction.py',{'EnvironmentController':Controller,'TYPE_MYSQL':'mysql','TYPE_SQLITE':'sqlite','DBBenchEnvironmentDelegation':Delegation},lambda n:n.level or (n.module or '').startswith('agentrl'))
processor=load('db_original_processor',SOURCE/'result_processor.py',{'Database':interaction.Database},lambda n:n.level)
# Load the native initialization and grading methods unchanged, without importing the HTTP worker.
tree=ast.parse((SOURCE/'task.py').read_text());cls=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='DBBenchTask');cls.bases=[]
cls.body=[n for n in cls.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in ['_build_init_sql','_sanitize_identifier','_do_commit']]
constants=[n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SYSTEM_PROMPT' for t in n.targets)]
ns={**globals(),'Database':interaction.Database,'MySQLDatabase':interaction.MySQLDatabase,'DBResultProcessor':processor.DBResultProcessor,'TYPE_SQLITE':'sqlite','DBBenchHarnessRuntime':Any}
exec(compile(ast.Module(body=constants+[cls],type_ignores=[]),str(SOURCE/'task.py'),'exec'),ns)
Task=ns['DBBenchTask'];SYSTEM_PROMPT=ns['SYSTEM_PROMPT']
TOOLS=json.loads((ROOT/'tools.json').read_text())
DATA={}
def dataset(split):
 if split not in DATA:DATA[split]=[json.loads(l) for l in (ROOT/'data'/('db_out_new.jsonl' if split=='train' else 'standard.jsonl')).read_text().splitlines() if l.strip()]
 return DATA[split]
class Environment:
 def __init__(self,config):self.db=None;self.loop=asyncio.new_event_loop();self.config=config
 def reset(self,task_id,seed,split):
  split,index=task_id.split('/');self.entry=copy.deepcopy(dataset(split)[int(index)])
  self.truth=self.entry.pop('answer_md5' if self.entry['type'][0] in ('INSERT','DELETE','UPDATE') else 'label',None)
  if self.entry.get('user_sqlite'):raise RuntimeError('This frozen DBBench protocol requires MySQL tasks')
  self.task=Task();self.task.logger=logging.getLogger('dbbench-grader');self.task.logger.disabled=True;self.task.env_controller=Controller(self.config)
  self.db=interaction.MySQLDatabase(self.task.env_controller);self.loop.run_until_complete(self.db.initialize());self.loop.run_until_complete(self.db.batch_execute(Task._build_init_sql(self.entry)))
  prompt=''
  for k,label in [('evidence','Evidence about the question: '),('add_description','Additional table information about the question: ')]:
   if self.entry.get(k):prompt+=label+self.entry[k]+'\n'
  prompt+='Question: '+self.entry['description']+'\n'
  self.public_context={k:copy.deepcopy(self.entry[k]) for k in ('description','type','table','evidence','add_description') if k in self.entry}
  return {'system_prompt':SYSTEM_PROMPT,'observation':prompt,'tools':TOOLS,'task_context':self.public_context}
 def step(self,name,arguments):
  if name=='execute_sql':
   sql=next(iter(arguments.values()),'')
   try:out=self.loop.run_until_complete(asyncio.wait_for(self.db.execute(sql),60)) or 'No response from database.'
   except asyncio.TimeoutError:out='Error: SQL execution timed out.'
   except Exception as e:out='Error executing query: '+str(e)
   return {'observation':out,'score':0,'done':False,'error':False}
  if name=='commit_final_answer':
   answers=next(iter(arguments.values()),[]);answers=answers if isinstance(answers,list) else [str(answers)]
   result=self.loop.run_until_complete(self.task._do_commit(answers,self.entry,self.truth,self.db,None,{},0))
   return {'observation':'Final answer submitted.','score':float(result['is_correct']),'done':True,'error':False}
  return {'observation':'Invalid function call. Please use execute_sql or commit_final_answer.','score':0,'done':False,'error':False}
 def close(self):
  if self.db:self.loop.run_until_complete(self.db.delete());self.db=None
  self.loop.close()
def create_environment(config):return Environment(config)
