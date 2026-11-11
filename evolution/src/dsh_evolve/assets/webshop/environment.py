import json,os,time,urllib.request,urllib.error
from pathlib import Path
class Environment:
 def __init__(self,config):self.config=config;self.sid=None
 def rpc(self,path,body):
  req=urllib.request.Request(self.config['url']+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
  try:
   with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=120) as response:r=json.load(response)
   if r.get('environment_id')!=self.config['environment_id']:raise RuntimeError('Frozen environment identity changed')
   return r
  except Exception as error:
   row={'at':time.time(),'candidate':os.environ.get('DSH_CANDIDATE_ID'),'task_id':getattr(self,'task_id',None),'seed':getattr(self,'seed',None),'split':getattr(self,'split',None),'error':str(error),'endpoint':path}
   with Path(self.config['fault_log']).open('a') as f:f.write(json.dumps(row)+'\n')
   raise
 def reset(self,task_id,seed,split):
  self.task_id=task_id;self.seed=seed;self.split=split;r=self.rpc('/reset',{'task_id':int(task_id)});self.sid=r['session']
  return {'system_prompt':Path(self.config['system_prompt_file']).read_text(),'tools':json.loads(Path(self.config['tools_file']).read_text()),'observation':f"The initial observation:\n{r['observation']}\n\nAvailable Actions:\n{r['available_actions']}"}
 def step(self,name,arguments):
  if name=='search_action':action=f"search[{arguments['keywords']}]"
  elif name=='click_action':action=f"click[{arguments['value']}]"
  else:return {'observation':'No valid tool call found from agent.','score':0,'done':False,'error':True}
  r=self.rpc('/step',{'session':self.sid,'action':action})
  return {'observation':f"Action: {action}\n\nObservation:\n{r['observation']}\n\nAvailable Actions:\n{r['available_actions']}",'score':r['reward'],'done':r['done'],'error':False,'executed_action':action}
 def close(self):
  if self.sid:self.rpc('/close',{'session':self.sid})
def create_environment(config):return Environment(config)
