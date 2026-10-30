"""Export aggregate experiment records without prompts, traces, or service credentials.

Run on the machine holding native experiments:
  python collect.py --root /path/to/experiments --output /path/to/export
Only reads experiment data; never starts or changes an experiment.
"""
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime, timezone
import argparse, json, re, statistics
import yaml

CAMPAIGNS=['loop-comparison-20r-20261025','loop-expansion-sol40-20261026','loop-l6-attribution-40r-20261026','loop-l789-sol40-20261026']
FEEDBACK='failure-frontier-fivebench-20261029'
BENCHES={'dbbench':'DBBench','webshop':'WebShop','osbench':'OSBench','alfworld':'ALFWorld','telecom':'Telecom'}
CACHE={}
METRICS=('episodes','valid','invalid','mean','strict_pass_at_1','strict_successes','successes','success_rate','planned','completed','missing','repeat_means','repeat_standard_deviation')

def read(path,default=None):
    return json.loads(path.read_text()) if path.exists() else default

def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

def clean(value):
    if isinstance(value,dict):
        return {k:clean(v) for k,v in value.items() if k not in ('pid','session','session_id','thread_id','stderr','command','docker_host','api_key','key','token','password','source_root','source_dir')}
    if isinstance(value,list):return [clean(v) for v in value]
    if isinstance(value,str):
        if value.startswith(('http://127.','http://localhost','http://10.','http://172.','http://192.','unix://')):return '${SERVICE_ENDPOINT}'
        if value.startswith(('/mnt/','/home/','/Users/')):
            if any(x in value for x in ['/batches/','/plugins/']):return '/'.join(value.split('/')[-2:])
            return '${ASSET_ROOT}/'+Path(value).name
        value=re.sub(r'/(?:mnt|home|Users)/[^\s\"\']+', '[local path omitted]',value)
    return value

def simple_metrics(value):
    if not isinstance(value,dict):return value
    return {k:value[k] for k in METRICS if k in value}

def task_manifest(base,cfg):
    b=cfg.get('benchmark',{});out={}
    for name in ('train','validation','test'):
        files=b.get('train_batches') if name=='train' and b.get('train_batches') else [b.get(name)]
        batches=[]
        for f in files or []:
            if not isinstance(f,str):continue
            p=Path(f);p=p if p.is_absolute() else base/p
            if not p.exists():continue
            records=[]
            for line in p.read_text().splitlines():
                if not line.strip():continue
                row=json.loads(line);records.append({k:row[k] for k in ('task_id','trial','seed') if k in row})
            batches.append({'file':Path(f).name,'rows':records,'unique_tasks':len({str(x.get('task_id')) for x in records}),'episodes':len(records)})
        if batches:out[name]=batches
    return out

def native_records(path):
    if path.is_dir():
        for file in sorted(path.glob('trial-*/*--t*.json')):
            d=read(file)
            reward=(d.get('reward_info') or {}).get('reward')
            yield {'task_id':d['task_id'],'trial':d.get('trial',0),'seed':d.get('seed'),
                   'score':reward,'valid':reward is not None and d.get('termination_reason') in ['user_stop','agent_stop','max_steps','too_many_errors','timeout'],
                   'termination_reason':d.get('termination_reason')}
    else:
        with path.open() as stream:
            for line in stream:
                if line.strip():yield json.loads(line)


def aggregate_test(path,expected=None):
    if not path.exists():return None
    rows={};attempts=0;invalid_attempts=0
    for d in native_records(path):
        attempts+=1
        if d.get('valid') is not True:invalid_attempts+=1;continue
        key=(str(d['task_id']),d.get('trial',0),d.get('seed'))
        requests=d.get('requests');actions=d.get('environment_actions');activations=d.get('activations');executions=d.get('executions')
        plugins=Counter(x.get('method_id') for x in activations or [] if isinstance(x,dict) and x.get('method_id') and x.get('hook')!='loaded')
        rows[key]={'score':d['score'],'elapsed_seconds':d.get('elapsed_seconds'),
                   'requests':len(requests) if isinstance(requests,list) else None,
                   'environment_actions':len(actions) if isinstance(actions,list) else None,
                   'plugin_event_count':sum(plugins.values()),'plugins':list(plugins),
                   'effective_control_receipts':sum(1 for x in executions or [] if isinstance(x,dict) and x.get('effective') is True and x.get('source')=='runner' and x.get('method_id')),
                   'termination_reason':d.get('termination_reason')}
    if not rows:return {'valid_episodes':0,'raw_attempts':attempts,'invalid_attempts':invalid_attempts}
    bytrial=defaultdict(list);bytask=defaultdict(list);plugins=Counter();term=Counter()
    for (task,trial,seed),d in rows.items():
        bytrial[trial].append(d['score']);bytask[task].append({'trial':trial,'seed':seed,'score':d['score']});plugins.update(d['plugins']);term[d['termination_reason']]+=1
    rates=[sum(v>=1 for v in scores)/len(scores) for _,scores in sorted(bytrial.items())]
    means=[statistics.mean(scores) for _,scores in sorted(bytrial.items())]
    all3=[v for v in bytask.values() if len(v)==3 and len({r['trial'] for r in v})==3]
    out={'valid_episodes':len(rows),'expected_episodes':expected,'missing_episodes':max(0,expected-len(rows)) if expected is not None else None,
         'raw_attempts':attempts,'invalid_attempts':invalid_attempts,'tasks':len(bytask),'repeats_observed':len(bytrial),
         'strict_successes':sum(d['score']>=1 for d in rows.values()),'strict_pass_at_1':sum(d['score']>=1 for d in rows.values())/len(rows),
         'mean_reward':statistics.mean(d['score'] for d in rows.values()),
         'per_repeat':[{'trial':trial,'episodes':len(scores),'strict_successes':sum(x>=1 for x in scores),'strict_success_rate':sum(x>=1 for x in scores)/len(scores),'mean_reward':statistics.mean(scores)} for trial,scores in sorted(bytrial.items())],
         'strict_repeat_population_std':statistics.pstdev(rates),'mean_reward_repeat_population_std':statistics.pstdev(means),
         'task_groups_with_three_trials':len(all3),
         'observed_any_success_3':sum(any(r['score']>=1 for r in v) for v in all3)/len(all3) if len(all3)==len(bytask) else None,
         'observed_all_success_3':sum(all(r['score']>=1 for r in v) for v in all3)/len(all3) if len(all3)==len(bytask) else None,
         'termination_counts':dict(term),'runtime':{},'per_task_outcomes':dict(sorted(bytask.items()))}
    for k in ('elapsed_seconds','requests','environment_actions','plugin_event_count','effective_control_receipts'):
        values=[d[k] for d in rows.values() if d[k] is not None]
        out['runtime'][k]={'sum':sum(values),'mean':statistics.mean(values),'observed_episodes':len(values)} if values else None
    out['runtime']['plugin_event_episode_coverage']=dict(sorted(plugins.items()))
    out['runtime']['token_usage']=None
    out['runtime']['note']='Request/event/control counts are execution observations, not causal gains. Elapsed-seconds sum is aggregate episode work, not wall-clock time.'
    return out

def curve(base):
    points=[]
    for p in sorted((base/'runs/decisions').glob('v*.json')):
        d=read(p);version=d.get('candidate',p.stem)
        m=read(base/'materials'/version/'loop-metrics.json',{})
        comparison=read(base/'materials'/version/'loop-comparison.json',{})
        validation_summary=read(base/'runs/evaluations'/version/'validation/summary.json',{})
        if not m:m=d.get('loop_metrics') or {}
        runtime={name:{k:v for k,v in stats.items() if k in ('loaded','events','request_hits','control_receipts','hook_events')} for name,stats in m.get('runtime',{}).items()}
        clusters=[{k:v for k,v in x.items() if k in ('id','tasks','repaired','regressed','behavior_changed','plugins')} for x in m.get('clusters',[])]
        target=[x for x in clusters if x.get('plugins')]
        points.append({'round':int(re.sub(r'\D','',version) or 0),'version':version,'parent':d.get('parent'),'adopted':d.get('adopted'),
                       'champion_changed':d.get('champion_changed'), 'training':simple_metrics(d.get('training')),
                       'validation':simple_metrics(d.get('validation')),'parent_validation':simple_metrics(d.get('parent_validation')),
                       'selection_metric':d.get('selection_metric',comparison.get('selection_metric')), 'at':d.get('at'),
                       'batch':m.get('batch',comparison.get('batch')),
                       'parent_training':simple_metrics(comparison.get('before')),
                       'training_strict':comparison.get('train_strict_after',(d.get('training') or {}).get('strict_pass_at_1')),
                       'validation_strict':comparison.get('validation_strict_after',validation_summary.get('strict_pass_at_1')),
                       'validation_mean_reward':validation_summary.get('mean',comparison.get('validation_after')),
                       'paired_reward':{k:v for k,v in comparison.get('paired',{}).items() if k in ('improved','regressed','unchanged')} if isinstance(comparison.get('paired'),dict) else None,
                       'paired':{k:m.get(k) for k in ('before','after','net_successes','repaired','regressed','diagnosed_failed_tasks','parent_failed_tasks')},
                       'target_clusters':clusters,'planned_target_repairs':sum(x.get('repaired',0) for x in target) if target else None,
                       'runtime_evidence':runtime,'cross_batch_review':m.get('cross_batch_review'),'validation_family_macro':m.get('validation_family_macro')})
    return points

def collect_group(base,root,outdir,group_id,kind):
    cfg=yaml.safe_load((base/'experiment.yaml').read_text())
    f=read(base/'runs/final.json');points=curve(base)
    bench=(cfg.get('domain') or base.parent.name).lower();bench='telecom' if bench.startswith('telecom') else bench
    b=cfg.get('benchmark',{});man=task_manifest(base,cfg)
    slug=group_id.replace('/','--')
    public_cfg=clean(cfg)
    public_cfg.pop('node',None);public_cfg.pop('output',None);public_cfg.pop('batch_id',None)
    # Connection placeholders are deployment inputs; recorded experiment semantics remain unchanged.
    if isinstance(public_cfg.get('benchmark',{}).get('model'),dict):public_cfg['benchmark']['model']['base_url']='${MODEL_BASE_URL}'
    public_cfg['publication_note']='Configuration evidence, not a complete environment bundle. Use the released reproduction instructions for executable setup.'
    write(outdir/'protocols'/(slug+'.json'),public_cfg);write(outdir/'tasks'/(slug+'.json'),man)
    final=None
    if f:
        final={k:f.get(k) for k in ('best','rounds','loop','test_policy','selection_metric','startpoint')}
        for split in ('train','validation','test'):
            if split in f:final[split]={k:simple_metrics(v) for k,v in f[split].items() if k in ('baseline','best')}
    final_test=None
    if f and f.get('best'):
        expected=sum(x['episodes'] for x in man.get('test',[])) or f.get('test',{}).get('best',{}).get('episodes')
        test_path=base/'runs/evaluations'/f['best']/'test/episodes.jsonl'
        if not test_path.exists():test_path=base/'runs'/f['best']/'test'
        cached=CACHE.get(group_id)
        final_test=cached.get('final_test') if cached and (cached.get('final_selection') or {}).get('best')==f['best'] else aggregate_test(test_path,expected)
        if final_test:
            if 'per_task_outcomes' in final_test:write(outdir/'test-outcomes'/(slug+'.json'),final_test.pop('per_task_outcomes'))
            final_test['per_task_outcomes_file']='test-outcomes/'+slug+'.json'
    state=read(base/'worker-status.json',{})
    ts=[p['at'] for p in points if isinstance(p.get('at'),(int,float))]
    variants=cfg.get('loop',{});frontier=cfg.get('frontier',{})
    method=variants.get('variant',cfg.get('method'))
    if kind=='feedback':method='dsh_'+frontier.get('feedback',base.name.replace('dsh-',''))
    method={'L8-internal':'L8_internal','L8-external':'L8_external','Resume':'resume'}.get(method,method)
    if method=='L4' and 'l4-best' in base.name:method='L4_seeded'
    source=base.relative_to(root).as_posix()
    native_fields={k:b.get(k) for k in ('max_steps','max_model_calls','timeout_seconds','concurrency','trials','train_tasks','test_tasks','temperature','max_tokens','simulator') if k in b}
    task_counts={s:{'tasks':len({str(r.get('task_id')) for batch in batches for r in batch['rows']}),'episodes':sum(x['episodes'] for x in batches),'batches':len(batches)} for s,batches in man.items()}
    return {'id':group_id,'source_locator':source,'benchmark':bench,'method_id':method,'group':base.name,'campaign':source.split('/')[0],
            'collection':'feedback' if kind=='feedback' else 'mainline','configuration_file':'protocols/'+slug+'.json','task_manifest_file':'tasks/'+slug+'.json',
            'optimizer':clean(cfg.get('optimizer')),'actor':clean(b.get('model')),'user_simulator':b.get('simulator'),
            'learning_model':clean(cfg.get('learning')),'feedback_model':clean(frontier),'startpoint':cfg.get('start_label'),
            'selection_rule':clean(variants),'protocol':native_fields,'split_counts':task_counts,'candidate_budget':cfg.get('rounds'),
            'decisions_completed':len(points),'adopted_candidates':sum(x['adopted'] is True for x in points),
            'champion_changes':sum(x['champion_changed'] is True for x in points),'status':'final_test_complete' if final and final_test and final_test.get('missing_episodes')==0 else 'completed_with_native_summary' if final else state.get('phase','incomplete'),
            'independent_search_repetitions':1,'test_repeats':final_test.get('repeats_observed') if final_test else b.get('trials'),
            'final_selection':final,'final_test':final_test,'curve':points,
            'efficiency':{'first_to_last_decision_seconds':max(ts)-min(ts) if len(ts)>1 else None,'optimizer_tokens':None,'learning_tokens':None,'cost_currency':None,'note':'Decision span excludes unrecorded start time and final test; it is not total compute cost.'},
            'evidence_gaps':['Search repetition count is one campaign, not the number of test trials.','Optimizer token/currency totals are not uniformly available.','Cross-stage train-test subtraction is omitted when task pools or metrics differ.']}

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--skip-episodes',action='store_true',help='Reuse previously exported tests only when the selected checkpoint is unchanged');a=ap.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    if a.skip_episodes:
        CACHE.update({r['id']:r for r in read(a.output/'runs.json',{}).get('runs',[])})
    runs=[]
    for campaign in CAMPAIGNS:
        for p in sorted((a.root/campaign).glob('*/*/experiment.yaml')):
            if not (p.parent/'runs/final.json').exists():continue
            ident=p.parent.relative_to(a.root).as_posix();runs.append(collect_group(p.parent,a.root,a.output,ident,'mainline'))
    for p in sorted((a.root/FEEDBACK/'experiments').glob('*/*/experiment.yaml')):
        if p.parent.name not in ['dsh-summary','dsh-mechanism']:continue
        ident=p.parent.relative_to(a.root).as_posix();runs.append(collect_group(p.parent,a.root,a.output,ident,'feedback'))
    write(a.output/'runs.json',{'schema_version':1,'collected_at':datetime.now(timezone.utc).isoformat(),'run_count':len(runs),'runs':runs})
    print(json.dumps({'runs':len(runs),'complete_native_summaries':sum(r['final_selection'] is not None for r in runs),'episode_aggregations':sum(r['final_test'] is not None for r in runs)}))
if __name__=='__main__':main()
