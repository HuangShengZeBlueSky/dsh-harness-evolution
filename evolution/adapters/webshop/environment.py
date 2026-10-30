import json, urllib.request
from pathlib import Path

def rpc(url, body):
 req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=120) as response:return json.load(response)

class Environment:
 def __init__(self, config): self.config=config; self.sid=None
 def reset(self, task_id, seed, split):
  r=rpc(self.config['url']+'/reset',{'task_id':int(task_id)})
  self.sid=r['session']
  return {'system_prompt':Path(self.config['system_prompt_file']).read_text(),'tools':json.loads(Path(self.config['tools_file']).read_text()),'observation':f"The initial observation:\n{r['observation']}\n\nAvailable Actions:\n{r['available_actions']}"}
 def step(self, name, arguments):
  if name=='search_action':action=f"search[{arguments['keywords']}]"
  elif name=='click_action':action=f"click[{arguments['value']}]"
  else:return {'observation':'No valid tool call found from agent.','score':0,'done':False,'error':True}
  r=rpc(self.config['url']+'/step',{'session':self.sid,'action':action})
  return {'observation':f"Action: {action}\n\nObservation:\n{r['observation']}\n\nAvailable Actions:\n{r['available_actions']}",'score':r['reward'],'done':r['done'],'error':False,'executed_action':action}
 def close(self):
  if self.sid:rpc(self.config['url']+'/close',{'session':self.sid})
def create_environment(config):return Environment(config)
