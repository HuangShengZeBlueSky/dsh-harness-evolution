from pathlib import Path
import argparse,json,shutil,time,os
from collections import defaultdict
from .l6 import Campaign as Core
from astra_evolve.records import read,write,summary
from .learning import run_job,campaign_packet


class Campaign(Core):
    @property
    def mode(self): return self.cfg['loop']['variant']

    def learning_status(self,phase,status):
        write(self.base/'learning-status.json',{'phase':phase,'status':status,'updated_at':time.time(),'pid':os.getpid()})

    def initialize(self):
        if self.mode=='L8-external':
            target=self.base/'experience/external.md'
            if not target.exists():
                self.learning_status('整次实验外部经验学习','running')
                payload={'campaigns':[campaign_packet((self.base/Path(p)).resolve()) for p in self.cfg['loop']['experience_sources']]}
                text=run_job(self.base.parent,self.cfg['name']+'-external',
                    (self.base/'OUTER_PROMPT.txt').read_text(),payload,self.cfg['learning'])
                target.parent.mkdir(exist_ok=True);target.write_text(text)
                self.learning_status('整次实验外部经验学习','complete')
        elif self.mode=='L9':
            target=self.base/'components/catalog.md'
            if not target.exists():
                self.learning_status('已有零部件分析','running')
                index=read(self.base/'components/index.json')
                text=run_job(self.base.parent,self.cfg['name']+'-components',
                    '阅读给出的已有插件源码和训练结果，按可复用能力整理一个简短零部件目录。说明职责、适用条件、共享状态和组合冲突；不要按测试分数筛选。每条保留零部件编号，供优化器选择。不要设计新插件。',
                    index,self.cfg['learning'])
                target.write_text(text)
                self.learning_status('已有零部件分析','complete')

    def prepare(self,name,parent=None):
        self.initialize()
        if self.mode=='L8-internal':
            for decision in sorted((self.root/'decisions').glob('v*.json')):self.learn(decision.stem)
        super().prepare(name,parent)
        target=self.candidate(name)/'experience.md'
        if self.mode.startswith('L8'):
            src=self.base/'experience'/('external.md' if self.mode=='L8-external' else 'internal.md')
            target.write_text(src.read_text() if src.exists() else '本次尚未形成经验。根据本轮日志独立诊断。\n')
        elif self.mode=='L9':
            shutil.copy2(self.base/'components/catalog.md',self.candidate(name)/'component-catalog.md')

    def plan(self,name):
        analysis=read(self.candidate(name)/'analysis.json');parent=read(self.candidate(name)/'parent.json')['parent']
        failures={r['task_id'] for r in self.rows(parent,'train',self.batch(name)) if r['score']<1}
        assigned={t for cluster in analysis.get('clusters',[]) for t in cluster.get('members',[])}
        if not failures<=assigned:
            raise ValueError('Scan the complete failure index and group all failures; uncertain cases may be an unresolved cluster. Read representative full traces, not every trace mechanically.')
        if self.mode.startswith('L8') and not analysis.get('experience_use'):
            raise ValueError('Briefly state which experience applies, does not apply, or needs revision; no forced reuse.')
        if self.mode=='L9' and not analysis.get('assembly'):
            raise ValueError('Describe selected components, compatibility, conflicts and remaining gaps, or explain why existing parts do not apply.')
        super().plan(name)
        plan_path=self.base/'materials'/name/'repair-plan.json';plan=read(plan_path)
        if self.mode.startswith('L8'):plan['experience_used_text']=(self.candidate(name)/'experience.md').read_text()
        write(plan_path,plan)

    def component(self,name,ident):
        plan=read(self.base/'materials'/name/'repair-plan.json');index=read(self.base/'components/index.json')
        part=next(p for p in index['components'] if p['id']==ident)
        method=part['method'];allowed={p for r in plan['repairs'] for p in r['plugin_ids']}
        if method['id'] not in allowed:raise ValueError('Include the component plugin ID in the repair plan before assembling.')
        candidate=self.candidate(name);dest=candidate/'parts'/part['bundle']
        if not dest.exists():shutil.copytree(part['path'],dest,ignore=shutil.ignore_patterns('node_modules'))
        comp=read(candidate/'composition.json');new=dict(method,module=str(Path('parts')/part['bundle']/method['module']))
        comp['methods']=[m for m in comp['methods'] if m['id']!=method['id']]+[new]
        if method['id'] not in comp['selected']:comp['selected'].append(method['id'])
        write(candidate/'composition.json',comp)
        log=candidate/'assembly-log.json';items=read(log) if log.exists() else {'imports':[]}
        items['imports'].append({'component':ident,'plugin':method['id'],'at':time.time()});write(log,items)
        print('Assembled',ident,'as',method['id'])

    def report(self,name,parent=None):
        report=super().report(name,parent);parent=report['parent'];eligible=report['eligible_to_adopt']
        a,b=self.rows(parent,'validation'),self.rows(name,'validation')
        success=lambda rows:sum(r['score']>=1 for r in rows)/len(rows)
        va,vb=success(a),success(b);eligible=eligible and vb>=va
        report.update(validation_before=va,validation_after=vb)
        domain=self.cfg['domain']
        if domain=='DBBench':
            nxt=self.batch(name)%len(self.batches)+1
            for v in [parent,name]:self.evaluate(v,'train',batch=nxt)
            ca,cb=success(self.rows(parent,'train',nxt)),success(self.rows(name,'train',nxt))
            report['cross_batch_review']={'batch':nxt,'before':ca,'after':cb};eligible=eligible and cb>=ca
        if domain=='OSBench':
            families=self.cfg['loop']['validation_families'];old={r['task_id']:r for r in a};groups=defaultdict(lambda:[[],[]])
            for r in b:
                group=groups[families[r['task_id']]];group[0].append(old[r['task_id']]['score']);group[1].append(r['score'])
            ma=sum(sum(g[0])/len(g[0]) for g in groups.values())/len(groups)
            mb=sum(sum(g[1])/len(g[1]) for g in groups.values())/len(groups)
            report['validation_family_macro']={'before':ma,'after':mb,'families':len(groups)};eligible=eligible and mb>=ma
        report['eligible_to_adopt']=eligible;metrics=report['loop_metrics']
        metrics.update(eligible_to_adopt=eligible,validation_before=va,validation_after=vb,
            cross_batch_review=report.get('cross_batch_review'),validation_family_macro=report.get('validation_family_macro'),variant=self.mode)
        write(self.base/'materials'/name/'loop-metrics.json',metrics);write(self.base/'materials'/name/'loop-comparison.json',report)
        return report

    def decide(self,name,adopt,reason):
        super().decide(name,adopt,reason)
        path=self.root/'decisions'/(name+'.json');d=read(path);m=read(self.base/'materials'/name/'loop-metrics.json')
        d.update(loop=self.mode,validation=m['validation_after'],parent_validation=m['validation_before']);write(path,d)
        if self.mode=='L8-internal':self.learn(name)

    def learn(self,name):
        done=self.base/'experience'/name/'experience.md'
        if done.exists():return
        decision=read(self.root/'decisions'/(name+'.json'));metrics=read(self.base/'materials'/name/'loop-metrics.json')
        plan=read(self.base/'materials'/name/'repair-plan.json');prior=self.base/'experience/internal.md'
        records={r['task_id']:r for r in self.rows(name,'train',self.batch(name))}
        old={r['task_id']:r for r in self.rows(decision['parent'],'train',self.batch(name))}
        examples=[]
        for outcome in ['repaired','regressed','unchanged']:
            matches=[r for r in metrics['paired'] if r['outcome']==outcome]
            if outcome=='unchanged':matches=[r for r in matches if not r['after']]
            for pair in matches[:2]:
                tid=pair['task_id'];examples.append({'task_id':tid,'outcome':outcome,
                    'before_messages':old[tid]['messages'],'after_messages':records[tid]['messages']})
        payload={'prior_experience':prior.read_text() if prior.exists() else '', 'plan':plan,'decision':decision,
            'actual_outcomes':metrics,'training_trajectories':examples}
        self.learning_status(name+'内部经验更新','running')
        text=run_job(self.base.parent,self.cfg['name']+'-'+name,
            (self.base/'INNER_PROMPT.txt').read_text(),payload,self.cfg['learning'])
        done.parent.mkdir(parents=True,exist_ok=True);done.write_text(text);prior.write_text(text)
        self.learning_status(name+'内部经验更新','complete')

    def finish(self):
        self.require_decisions()
        if self.mode=='L8-external' and not (self.base/'experience/next-campaign.md').exists():
            self.learning_status('四十轮结束后的外部经验更新','running')
            text=run_job(self.base.parent,self.cfg['name']+'-next-campaign',
                (self.base/'OUTER_PROMPT.txt').read_text(),{'campaigns':[campaign_packet(self.base)],
                    'previous_experience':(self.base/'experience/external.md').read_text()},self.cfg['learning'])
            (self.base/'experience/next-campaign.md').write_text(text)
            self.learning_status('四十轮结束后的外部经验更新','complete')
        super().finish()

