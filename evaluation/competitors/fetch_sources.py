"""Retrieve attributed paper prompts and released source assets; do not optimize them."""
from pathlib import Path
import argparse,json,re,urllib.request
from bs4 import BeautifulSoup

def retrieve(url):return urllib.request.urlopen(url,timeout=45).read()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);args=parser.parse_args();out=args.output/'sources';out.mkdir(parents=True,exist_ok=True)
 url='https://arxiv.org/html/2505.15182';soup=BeautifulSoup(retrieve(url),'html.parser');instructions=soup.find(id='A11.SS1.SSS1').get_text(' ',strip=True);examples=soup.find(id='A11.SS1.SSS2').get_text('\n',strip=True)
 common=instructions[instructions.index('Interact with'):instructions.index('For each of your turn')].strip();actions=instructions[instructions.index('The available actions are:'):];actions=actions[:actions.index('After your each turn')].strip()
 for key,label,next_label,figures in [('react','ReAct','(ReflAct)',[15,17]),('reflact','ReflAct','The available actions are:',[16,18])]:
  start=instructions.index('('+label+')')+len(label)+2;stop=instructions.index(next_label,start);policy=instructions[start:stop].strip();demos=[]
  for task,figure in zip(['pick and place','pick clean then place'],figures):
   heading=f'Prompt for ALFWorld {label}, "{task}" task';start=examples.index(heading)+len(heading);stop=examples.index(f'Figure {figure}:',start);sample=examples[start:stop].strip();sample=re.sub(r'\n(Thought|Reflection|Action|Observation)\n:',r'\n\1:',sample);demos.append(sample)
  (out/(key+'-prompt.json')).write_text(json.dumps(dict(method=label,source=url+'#A11.SS1',instruction=common+'\n'+policy+'\n'+actions,examples=demos,setting='Original method-specific policy and appendix demonstrations with common action-interface description.'),ensure_ascii=False,indent=2)+'\n')
 target=out/'automanual';(target/'prompts').mkdir(parents=True,exist_ok=True);base='https://raw.githubusercontent.com/minghchen/automanual/main/automanual_alfworld/'
 files={'env_history.py':'env_history.py','autobuild_utils.py':'autobuild_utils.py','test_trial.py':'test_trial.py','provider-source-ChatGPT_API.py':'OpenAI_Agent_API/ChatGPT_API.py','provider-source-__init__.py':'OpenAI_Agent_API/__init__.py','rule_manager.json':'gpt4preview_autobuildcase_manual/rule_manager.json','skill_bank.json':'gpt4preview_autobuildcase_manual/skill_bank.json','prompts/worker_prompt.txt':'prompts/worker_prompt.txt','prompts/autobuild_simple_examples.py':'prompts/autobuild_simple_examples.py'}
 for local,remote in files.items():(target/local).write_bytes(retrieve(base+remote))
 (out/'source-manifest.json').write_text(json.dumps(dict(react_reflact=url,automanual={local:base+remote for local,remote in files.items()}),indent=2)+'\n')
 r1=out/'harness-r1';r1.mkdir(exist_ok=True)
 r1base='https://raw.githubusercontent.com/DeepExperience/Harness-R1/main/'
 r1files={'dbbench.py':'code/life-harness/AgentBench/src/server/harness/dbbench.py','task.py':'code/life-harness/AgentBench/src/server/tasks/dbbench/task.py','code_runner.py':'code/life-harness/AgentBench/src/server/harness/code_runner.py','patch.json':'examples/heldout_generalization/harness-r1/seed20260720/dbbench.json'}
 for local,remote in r1files.items():(r1/local).write_bytes(retrieve(r1base+remote))
 print('Published prompts, manual and planner sources retrieved with provenance.')
if __name__=='__main__':main()
