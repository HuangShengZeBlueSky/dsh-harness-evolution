"""L4-simple: fixed training set, concise capability/diagnosis, one candidate and one gate."""
from pathlib import Path
import argparse,json,time,subprocess,sys,shutil
import yaml
from astra_evolve.project import Project
from astra_evolve.records import read,write,summary,key

def prepare_note(base,candidate,parent):
    comp=read(candidate/'composition.json');active=set(comp.get('selected',[]))
    lines=['# Current harness',f'Parent: {parent}', 'Task → actor → DSH hooks → environment → visible receipt → next action.']
    lines += [f"- {m['id']}: {m['module']}" for m in comp.get('methods',[]) if m['id'] in active]
    if not active:lines.append('No enhancement plugins (H0).')
    lines+=['','Before editing: state current capabilities and one evidenced failure class; propose the smallest useful plugin change.']
    (candidate/'agent-state.md').write_text('\n'.join(lines)+'\n')
    for name in ['analysis.json','proposal.json']:(candidate/name).unlink(missing_ok=True)

def record_plan(base,name,candidate):
    a=read(candidate/'analysis.json')
    if not a.get('agent_state') or not a.get('repairs') or not a.get('evidence'):raise ValueError('Write concise agent_state, trace evidence, target_tasks and repairs before editing.')
    a.update(candidate=name,recorded_at=time.time(),interpretation='Observed failure and proposed cause are distinct; not a causal verdict.')
    write(base/'materials'/name/'repair-plan.json',a);return a

class Simple(Project):
    def prepare(self,name,parent=None):
        parent=parent or self.best()
        if parent!=self.best():raise ValueError('Continue current training-selected parent')
        super().prepare(name,parent);prepare_note(self.base,self.candidate(name),parent)
    def plan(self,name):return record_plan(self.base,name,self.candidate(name))
    def evaluate(self,name,split='train',batch=None):
        if split=='development':split='train'
        if split not in ['train','test']:raise ValueError('Only fixed train and sealed final test')
        if split=='test':
            seal=read(self.root/'final-checkpoint.json') if (self.root/'final-checkpoint.json').exists() else {}
            if seal.get('candidate')!=name:raise ValueError('Test only the sealed final checkpoint')
        if name!='baseline' and split=='train' and not (self.base/'materials'/name/'repair-plan.json').exists():raise ValueError('Record concise failure analysis before evaluation')
        return super().evaluate(name,split,batch=None)
    def report(self,name,parent=None):
        r=super().report(name,parent);old=self.rows(r['parent'],'train');new=self.rows(name,'train');before={key(x):x for x in old}
        pairs=[{'task_id':x['task_id'],'trial':x['trial'],'before':before[key(x)]['score']>=1,'after':x['score']>=1} for x in new]
        a=sum(x['before'] for x in pairs)/len(pairs);b=sum(x['after'] for x in pairs)/len(pairs)
        plan=read(self.base/'materials'/name/'repair-plan.json');targets=set(plan.get('target_tasks',[]))
        stats={'before':a,'after':b,'repaired':sum(not x['before'] and x['after'] for x in pairs),'regressed':sum(x['before'] and not x['after'] for x in pairs),'planned_target_repairs':sum(x['task_id'] in targets and not x['before'] and x['after'] for x in pairs),'paired':pairs}
        # Removing redundant code may improve a harness without a newly activated plugin.
        used=bool(r['observed_changed_plugins'] or r['changes'].get('removed'))
        r.update(eligible_to_adopt=b>a and used,selection_metric='strict_success',strict_before=a,strict_after=b,failure_analysis=stats)
        write(self.base/'materials'/name/'comparison.json',r);return r
    def decide(self,name,adopt,reason):
        if (self.root/'decisions'/(name+'.json')).exists():raise ValueError('Decision already exists')
        super().decide(name,adopt,reason)
        p=self.root/'decisions'/(name+'.json');d=read(p);r=read(self.base/'materials'/name/'comparison.json')
        d.update(at=time.time(),loop='L4-simple-fixed',strict_train=r['strict_after'],parent_strict_train=r['strict_before'],failure_analysis=r['failure_analysis']);write(p,d)
    def finish(self):
        self.require_decisions();best=self.best()
        write(self.root/'final-checkpoint.json',{'candidate':best,'rounds':self.cfg['rounds'],'at':time.time(),'selection':'strict success on fixed train; test never used'})
        self.evaluate(best,'test');rows=self.rows(best,'test');t=summary(rows);t['strict_pass_at_1']=sum(x['score']>=1 for x in rows)/len(rows)
        write(self.root/'final.json',{'rounds':self.cfg['rounds'],'best':best,'loop':'L4-simple-fixed','test_policy':'only final selected checkpoint','train':{'best':summary(self.rows(best,'train'))},'test':{'best':t}})
        if not (self.base/'best').exists():shutil.copytree(self.root/'frozen'/best,self.base/'best',ignore=shutil.ignore_patterns('node_modules'))
        (self.root/'completed.txt').write_text('40 decisions and complete final test\n')

def main(config):
    cfg=yaml.safe_load(Path(config).read_text())
    if cfg.get('engine')=='telecom':
        raise SystemExit(subprocess.call([sys.executable,str(Path(__file__).with_name('telecom_loop.py')),str(config),*sys.argv[1:]],cwd=Path(config).parent))
    ap=argparse.ArgumentParser();ap.add_argument('action',choices=['status','prepare','plan','evaluate','report','decide','finish']);ap.add_argument('version',nargs='?');ap.add_argument('--parent');ap.add_argument('--split',default='train');ap.add_argument('--adopt',action='store_true');ap.add_argument('--reject',action='store_true');ap.add_argument('--reason',default='');a=ap.parse_args();c=Simple(config)
    if a.action=='status':print(json.dumps({'best':c.best(),'decisions':len(list((c.root/'decisions').glob('v*.json'))),'rounds':40}))
    elif a.action=='prepare':c.prepare(a.version,a.parent)
    elif a.action=='plan':c.plan(a.version)
    elif a.action=='evaluate':c.evaluate(a.version,a.split)
    elif a.action=='report':print(json.dumps(c.report(a.version),ensure_ascii=False))
    elif a.action=='decide':
        if a.adopt==a.reject:raise ValueError('Choose adopt or reject')
        c.decide(a.version,a.adopt,a.reason)
    else:c.finish()
