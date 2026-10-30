"""Replayable Codex learning jobs. User-facing experience stays short prose."""
from pathlib import Path
import json, os, subprocess, time, argparse, fcntl

def read(p, default=None):
    try: return json.loads(Path(p).read_text())
    except (OSError,ValueError): return {} if default is None else default

def write(p, value):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);q=p.with_suffix('.tmp');q.write_text(json.dumps(value,ensure_ascii=False,indent=2));q.replace(p)

def run_job(root, job, instruction, payload, learning):
    directory=Path(root)/'learning-jobs'/job;directory.mkdir(parents=True,exist_ok=True)
    with (directory/'job.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        return _run_job(root,job,instruction,payload,learning)

def _run_job(root, job, instruction, payload, learning):
    directory=Path(root)/'learning-jobs'/job;directory.mkdir(parents=True,exist_ok=True)
    result=directory/'result.md'
    if result.exists() and result.read_text().strip():return result.read_text()
    input_path=directory/'input.json';write(input_path,payload)
    prompt=instruction+'\n\n只使用以下输入及其中列明的训练文件，不联网、不读测试材料，不启动实验、不修改插件。输出简明中文，不写执行过程。\n'+json.dumps(payload,ensure_ascii=False)
    (directory/'prompt.txt').write_text(prompt)
    attempt=len(list(directory.glob('attempt-*.jsonl')))+1
    command=list(learning['command'])+['exec','--sandbox','read-only','-c','approval_policy="never"',
        '-c','model_reasoning_effort="'+learning['effort']+'"','--skip-git-repo-check','--model',learning['model'],
        '--json','--output-last-message',str(result),'-']
    write(directory/'invocation.json',{'command':command,'model':learning['model'],'effort':learning['effort'],'attempt':attempt,'started_at':time.time()})
    with (directory/f'attempt-{attempt:03d}.jsonl').open('w') as out,(directory/f'attempt-{attempt:03d}.stderr').open('w') as err:
        run=subprocess.run(command,input=prompt,text=True,cwd=directory,stdout=out,stderr=err,timeout=900)
    events=[]
    for line in (directory/f'attempt-{attempt:03d}.jsonl').read_text().splitlines():
        try:
            event=json.loads(line)
            if event.get('type') in ['turn.completed','turn.failed','thread.started']:events.append(event)
        except ValueError:pass
    write(directory/f'attempt-{attempt:03d}-result.json',{'exit_code':run.returncode,'finished_at':time.time(),'events':events})
    if run.returncode or not result.exists() or not result.read_text().strip():raise RuntimeError('Learning call incomplete; recorded input and call retained for resume.')
    return result.read_text()

def campaign_packet(source):
    source=Path(source);rounds=[];examples=[]
    for f in sorted((source/'runs/decisions').glob('v*.json')):
        decision=read(f);report=read(source/'materials'/f.stem/'loop-comparison.json') or read(source/'materials'/f.stem/'comparison.json')
        paired=report.get('paired') or {}
        paired={**paired,'changed':paired.get('changed',[])[:6]}
        rounds.append({'version':f.stem,'parent':decision.get('parent'),'adopted':decision.get('adopted'),
            'reason':decision.get('reason'),'before':report.get('before'),'after':report.get('after'),
            'paired':paired,'changes':report.get('changes'),
            'source_train_materials':str(source/'materials'/f.stem)})
    # Whole-campaign outcomes are supplied; full training traces stay queryable.
    for row in rounds:
        changed=(row.get('paired') or {}).get('changed',[])
        if changed and len(examples)<8:examples.append({'version':row['version'],'paired_tasks':changed[:4],
            'training_materials':row['source_train_materials']})
    return {'source':str(source),'rounds':rounds,'training_examples':examples,
            'note':'Whole completed campaign, TRAIN only. Never read final.json, test directories or held-out trajectories.'}
