"""Read existing fixed-set runs and repeat audit. No experiment or model calls.

python collect_architecture_evidence.py --root /path/to/experiment-parent --output output.json
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, json, statistics, re
from collections import Counter, defaultdict

def read(p, default=None):
    try: return json.loads(Path(p).read_text())
    except (OSError, ValueError): return default

def rows(path, trial=None):
    out={}
    if not path.exists(): return out
    for line in path.open():
        try: x=json.loads(line)
        except ValueError: continue
        if x.get('valid') and (trial is None or x['trial']==trial):
            out[(str(x['task_id']),int(x['trial']),int(x['seed']))]={'task_id':str(x['task_id']),'trial':int(x['trial']),'seed':int(x['seed']),'score':x['score'],'instruction':next((str(m.get('content','')) for m in x.get('messages',[]) if m.get('role')=='user'),'')}
    return out

def lexical_category(bench, text):
    s=text.lower()
    if bench=='dbbench':
        s=s.split('question:')[-1]
        patterns=[('insert',r'\b(insert|add .*row|add .*record)\b'),('delete',r'\b(delete|remove)\b'),('update',r'\b(update|change|set .* to)\b'),('aggregation',r'\b(count|how many|sum|total|average|maximum|minimum|highest|lowest)\b')]
        fallback='query_other'
    elif bench=='osbench':
        patterns=[('count_lines',r'count.*lines|number of lines'),('count_files',r'count.*files|number of files'),('aggregation',r'average|total.*size|sum|largest|smallest'),('mutation',r'create|delete|remove|rename|replace|modify'),('search_filter',r'find|search|matching|contain')];fallback='other'
    else:
        patterns=[('numeric_spec',r'\b\d+(?:\.\d+)?\s*(?:inch|ft|feet|oz|ounce|pack|count|mm|cm|gb|watt|liter)')];fallback='other_spec'
    return next((name for name,pat in patterns if re.search(pat,s)),fallback)

def cohort(before, after, target_ids=None):
    keys=set(before)&set(after)
    if target_ids is not None: keys={k for k in keys if k[0] in target_ids}
    initial_failed={k for k in keys if before[k]['score']<1};repaired={k for k in initial_failed if after[k]['score']>=1};unresolved=initial_failed-repaired
    regressed={k for k in keys if before[k]['score']>=1 and after[k]['score']<1}
    grouped=defaultdict(list)
    for k in keys: grouped[k[0]].append(k)
    full=[ks for ks in grouped.values() if len({k[1] for k in ks})==3]
    persistent=sorted(ks[0][0] for ks in full if any(before[k]['score']<1 for k in ks) and all(after[k]['score']<1 for k in ks))
    consistent=sorted(ks[0][0] for ks in full if all(before[k]['score']<1 for k in ks) and all(after[k]['score']>=1 for k in ks))
    return {'persistent_unresolved_task_ids':persistent if full else None,'consistently_repaired_task_ids':consistent if full else None,'task_id_note':'repaired/unresolved IDs may overlap across trials; persistent means final failed all3, consistently repaired means H0 failed all3 and final passed all3.','paired_episodes':len(keys),'baseline_failed_episodes':len(initial_failed),'repaired_episodes':len(repaired),'still_failed_episodes':len(unresolved),'newly_failed_episodes':len(regressed),'repair_fraction':len(repaired)/len(initial_failed) if initial_failed else None,'unresolved_task_ids':sorted({k[0] for k in unresolved}),'repaired_task_ids':sorted({k[0] for k in repaired}),'newly_failed_task_ids':sorted({k[0] for k in regressed})}

def labels(plan):
    value=plan.get('problem_type',[])
    if isinstance(value,str):value=[value]
    if isinstance(value,dict):value=[value]
    return sorted({str(v.get('label','unknown') if isinstance(v,dict) else v) for v in value})

def main(root, output):
    campaign=root/'simple-dsh-l4-fixed40-20261030';auditroot=root/'same-harness-generalization-3x-20261031'
    manifest=read(campaign/'manifest.json');state=read(campaign/'status.json',{})
    audits=read(auditroot/'report.json',{});auditjobs=read(auditroot/'manifest.json',{}).get('jobs',[])
    auditpaths={j['id']:Path(j['job']) for j in auditjobs};stats={j['id']:j for j in audits.get('jobs',[])}
    live={g['id']:g for g in state.get('groups',[])};out=[];cache={}
    def auditrows(ident,split):
        key=(ident,split)
        if key not in cache:cache[key]=rows(auditpaths[ident]/split/'episodes.jsonl') if ident in auditpaths else {}
        return cache[key]
    for g in manifest['groups']:
        base=Path(g['path']);ds=[read(f,{}) for f in sorted((base/'runs/decisions').glob('v*.json'))]
        final=read(base/'runs/final.json');sealed=read(base/'runs/final-checkpoint.json')
        rec=stats.get(g['id']);done=bool(final or (rec and rec['train']['complete'] and rec['test']['complete']))
        checkpoint=final.get('best') if final else sealed.get('candidate') if sealed else read(base/'runs/best.json',{}).get('candidate','baseline')
        baseline_path=base.parent/'shared-baseline'
        tele=g['benchmark']=='telecom'
        bsum=read(baseline_path/'baseline/train-summary.json',{}) if tele else read(baseline_path/'runs/evaluations/baseline/train/summary.json',{})
        baseline=bsum.get('strict_pass_at_1',bsum.get('mean'));champ=baseline;curve=[{'round':0,'candidate':'baseline','parent':None,'candidate_train':baseline,'champion_train':baseline,'adopted':False}]
        early=[];previous_pattern=None;patterns=[]
        for d in ds:
            n=int(d['candidate'][1:]);fa=d.get('failure_analysis',{});train=d.get('strict_train',d.get('training',{}).get('strict_pass_at_1',d.get('training',{}).get('mean')))
            if d.get('adopted'):champ=train
            pairs=fa.get('paired');pattern=tuple(sorted((str(p['task_id']),p['trial']) for p in pairs if p['after'])) if pairs is not None else None
            change=None if pattern is None or previous_pattern is None else len(set(pattern)^set(previous_pattern))
            if pattern is not None:previous_pattern=pattern;patterns.append(pattern)
            point={'round':n,'candidate':d['candidate'],'parent':d.get('parent'),'candidate_train':train,'champion_train':champ,'adopted':bool(d.get('adopted')),'target_repairs':fa.get('planned_target_repairs'),'repaired':fa.get('repaired'),'regressed':fa.get('regressed'),'candidate_success_set_change_from_previous':change}
            curve.append(point)
            if n<=5:
                plan=read(base/'materials'/d['candidate']/'repair-plan.json',{})
                early.append({'round':n,'candidate':d['candidate'],'adopted':bool(d.get('adopted')),'problem_labels':labels(plan),'target_task_ids':sorted({str(t) for t in plan.get('target_tasks',[])}),'immediate_target_repairs':fa.get('planned_target_repairs')})
        n=len(ds);window=curve[-min(10,n):] if n else [];start=next((p['champion_train'] for p in reversed(curve) if p['round']<=max(0,n-10)),baseline)
        improvements=[p['round'] for p in curve if p['adopted']]
        def nullable_sum(k):return sum(p[k] for p in window) if window and all(p.get(k) is not None for p in window) else None
        plateau={'window_rounds':len(window),'window_start':max(1,n-9) if n else None,'window_end':n,'last_improvement_round':max(improvements) if improvements else 0,'rounds_since_last_improvement':n-(max(improvements) if improvements else 0),'last10_adoptions':sum(p['adopted'] for p in window),'last10_adoption_rate':sum(p['adopted'] for p in window)/len(window) if window else None,'last10_champion_gain':champ-start if champ is not None and start is not None else None,'last10_target_repairs':nullable_sum('target_repairs'),'last10_repaired':nullable_sum('repaired'),'last10_regressed':nullable_sum('regressed'),'last10_mean_success_set_change':statistics.mean(p['candidate_success_set_change_from_previous'] for p in window if p['candidate_success_set_change_from_previous'] is not None) if any(p['candidate_success_set_change_from_previous'] is not None for p in window) else None,'last10_unique_candidate_success_patterns':len(set(patterns[-10:])) if patterns else None,'interpretation':'descriptive completed-candidate window; not a stop rule or global-optimum certificate','infrastructure_interrupted':not done and live.get(g['id'],{}).get('phase') in ['service_retry','optimizer_retry'],'completion_note':'Unfinished runs are not eligible for a convergence conclusion, including when a process reports optimizer_running.'}
        ec={'first5_plans':early,'baseline_failed_cohort':None,'first5_target_union':None,'residual_task_categories':None,'semantic_failure_resolution':None,'note':'Target task success is not proof that the named failure mechanism disappeared. Task-level cohorts are paired by task/trial/seed; ordinary independent model runs, no shared request coupling.'}
        if done and rec:
            h0id='simple40-'+g['benchmark']+'-h0-reference';before=auditrows(h0id,'train');after=auditrows(g['id'],'train');targets={t for p in early for t in p['target_task_ids']}
            if before and after:
                for proposal in early:proposal['final_target_outcome']=cohort(before,after,set(proposal['target_task_ids']))
                ec['baseline_failed_cohort']={'all_three_recorded_trials':cohort(before,after),'by_trial':[{'trial':t,**cohort({k:v for k,v in before.items() if k[1]==t},{k:v for k,v in after.items() if k[1]==t})} for t in range(3)]}
                target_result=cohort(before,after,targets)
                ec['first5_target_union']={'target_unique_tasks':len(targets),'target_task_ids':sorted(targets),'observed_target_outcome':target_result,'by_trial':[{'trial':t,**cohort({k:v for k,v in before.items() if k[1]==t},{k:v for k,v in after.items() if k[1]==t},targets)} for t in range(3)]}
                bycat=defaultdict(list)
                for r in after.values():bycat[lexical_category(g['benchmark'],r['instruction'])].append(r)
                ec['residual_task_categories']=[{'category':c,'tasks':len({r['task_id'] for r in rs}),'episodes':len(rs),'failed_episodes':sum(r['score']<1 for r in rs),'failure_rate':sum(r['score']<1 for r in rs)/len(rs)} for c,rs in sorted(bycat.items())]
        status='original_final_complete' if final else 'sealed_final_completed_in_independent_audit' if done else 'incomplete_not_convergence'
        out.append({'id':g['id'],'source_id':str(base.relative_to(root)),'benchmark':g['benchmark'],'optimizer':g['model'],'effort':g['effort'],'status':status,'live_phase_at_collection':live.get(g['id'],{}).get('phase'),'rounds':n,'budget':40,'checkpoint':checkpoint,'baseline_train':baseline,'curve':curve,'plateau':plateau,'early_cohorts':ec,'test_success':rec['test']['success_rate'] if rec and rec['test']['complete'] else None})
    repeats=[]
    for j in audits.get('jobs',[]):
        h0=stats.get('simple40-'+j['benchmark']+'-h0-reference')
        keep=lambda x:{k:x.get(k) for k in ['valid','expected','complete','success_rate','mean_reward','repeats','std','all_three','any_three','success_count_distribution','categories']}
        repeats.append({'id':j['id'],'benchmark':j['benchmark'],'optimizer':j['model'],'effort':j['effort'],'checkpoint':j['checkpoint'],'train':keep(j['train']),'test':keep(j['test']),'train_minus_test':j['train_minus_test'],'train_gain_over_h0':j['train']['success_rate']-h0['train']['success_rate'] if h0 else None,'test_gain_over_h0':j['test']['success_rate']-h0['test']['success_rate'] if h0 else None,'gap_added_over_h0':j['train_minus_test']-h0['train_minus_test'] if h0 and j['train_minus_test'] is not None else None,'test_standardized_to_train_categories':j.get('test_standardized_to_train_categories'),'standardization_train_mass_covered':j.get('standardization_train_mass_covered')})
    result={'schema_version':1,'collected_at':datetime.now(timezone.utc).isoformat(),'scope':'Read-only fixed40 evolution and same-frozen-harness three-repeat audit','summary':{'run_count':len(out),'original_final_complete':sum(r['status']=='original_final_complete' for r in out),'final_harness_audit_complete':sum(r['test_success'] is not None for r in out),'completed_decisions':sum(r['rounds'] for r in out),'planned_decisions':1600,'repeat_audit_complete':audits.get('complete'),'repeat_audit_total':audits.get('total')},'definitions':{'scores':'Strict success in [0,1]. Train curves are original selection measurements; frozen-harness repeat statistics are separate.','repeats':'Training trial0 participated in selection; trials1/2 are later measurements. Three test repeats are not independent searches.','plateau':'A finite no-improvement window conditional on observed operators, evidence, parent and budget; infrastructure interruption is not convergence.','early_problem':'Baseline-failed episode cohort and the first five proposals target-task union are distinct. Neither equals a complete semantic failure taxonomy.','categories':'Declared first-user-instruction lexical proxies; same category does not imply same difficulty. Semantic failure resolution remains null.','cohort':'Report baseline failure repair, residual failure and new regressions separately. Per-trial pairing controls task identity but not all model randomness.','pattern':'Success-set change compares adjacent candidates, which may have different parents; it is behavioral-outcome diversity, not source-code diversity.','fixed_budget':'All new variants are proposals elsewhere; this collector never launches experiments or changes selection.'},'featured_ids':['simple40-dbbench-sol56-high','simple40-webshop-sol61-high','simple40-osbench-sol61-medium'],'runs':out,'repeat_audit':repeats}
    Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result['summary']))
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args();main(a.root,a.output)
