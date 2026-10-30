"""One offline integration: real DSH hooks + unified L7; scripted actor, not a benchmark score."""
from pathlib import Path
import argparse,json,shutil,yaml
from astra_evolve.cli import init,setup,ASSETS
from astra_evolve.demo import ScriptedProvider
from astra_evolve.records import write
from dsh_evolve.factory import campaign
p=argparse.ArgumentParser();p.add_argument('directory');p.add_argument('--runtime-deps');a=p.parse_args()
r=init(a.directory,'demo');cfg=yaml.safe_load((r/'experiment.yaml').read_text());cfg.update(rounds=1,domain='Demo',test_schedule='final',loop={'variant':'L7'});cfg['benchmark'].update(train_batches=['train.jsonl'],validation='validation.jsonl',max_steps=8,max_model_calls=8,timeout_seconds=30,runner='demo');cfg['benchmark']['model'].update(name='offline-scripted-provider',api_key_env='',max_retries=0)
(r/'validation.jsonl').write_text(''.join(json.dumps({'task_id':'validation-only','trial':i,'seed':s})+'\n' for i,s in enumerate([11,22])))
if a.runtime_deps:(r/'runtime/node_modules').symlink_to(Path(a.runtime_deps).resolve(),target_is_directory=True)
else:setup(r/'experiment.yaml')
with ScriptedProvider() as endpoint:
 cfg['benchmark']['model']['base_url']=endpoint;(r/'experiment.yaml').write_text(yaml.safe_dump(cfg));c=campaign(r/'experiment.yaml');c.evaluate('baseline','development');c.prepare('v01');candidate=c.candidate('v01')
 write(candidate/'analysis.json',{'parent':'baseline','agent_state':'No repair plugins. The scripted actor stops before the required visible sequence.','clusters':[{'id':'early-stop','hypothesis':'One recovery message changes the next real action.','members':['train-a','train-b'],'controls':[],'evidence':[{'task_id':'train-a','message_index':0,'observation':'Visible task requires take, clean, put before finish.'}]}],'repairs':[{'cluster_id':'early-stop','plugin_ids':['one-recovery'],'operation':'add','hooks':['tools/pre-execute'],'trigger':'finish before recovery','state_change':'Episode-local single-use recovery state','expected_behavior':'take then clean then put','at_risk_tasks':[]}]})
 c.plan('v01');shutil.copy2(ASSETS/'example-plugins/one-recovery.mjs',candidate/'plugins/one-recovery.mjs');write(candidate/'composition.json',{'methods':[{'id':'one-recovery','module':'plugins/one-recovery.mjs','config':{}}],'selected':['one-recovery']});c.evaluate('v01','development');c.decide('v01',True,'Offline scripted integration only');c.finish()
print('PASS: shared L7 prepare/plan/DSH evaluation/promotion/final-test path; synthetic fixture only.')
