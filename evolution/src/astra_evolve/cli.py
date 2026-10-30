import argparse
import json
import os
import random
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path

import yaml

from .project import Project
from .config import load_config
from .records import read, write

ASSETS = Path(__file__).parent / 'assets'


def init(directory, kind):
    root = Path(directory).resolve()
    root.mkdir(parents=True, exist_ok=False)
    shutil.copytree(ASSETS / 'runtime', root / 'runtime', ignore=shutil.ignore_patterns('node_modules', '*lock*'))
    shutil.copy2(ASSETS / 'harness-api.txt', root / 'harness-api.txt')
    cfg = yaml.safe_load((ASSETS / 'experiment.yaml').read_text())
    cfg['benchmark']['kind'] = kind
    (root / 'baseline/plugins').mkdir(parents=True)
    write(root / 'baseline/composition.json', {'methods': [], 'selected': []})
    if kind in ['demo', 'python']:
        for split, names in [('train', ['train-a', 'train-b']), ('test', ['test-c'])]:
            rows = [{'task_id': n, 'trial': i, 'seed': seed} for n in names for i, seed in enumerate([11, 22])]
            (root / f'{split}.jsonl').write_text(''.join(json.dumps(r) + '\n' for r in rows))
        if kind == 'python':
            (root / 'environment.py').write_text(
                '"""Runnable example. Replace this environment with your own reset/step/close implementation."""\n'
                'from astra_evolve.environments import DemoEnvironment\n\n'
                'def create_environment(config):\n    return DemoEnvironment(config)\n')
            cfg['benchmark']['environment'] = {'factory': 'environment.py:create_environment'}
    if kind == 'command':
        cfg['benchmark']['command'] = ['{python}', 'your_evaluator.py']
        cfg['benchmark']['cwd'] = '.'
    (root / 'experiment.yaml').write_text(yaml.safe_dump(cfg, sort_keys=False))
    print(f'Created {root}. Edit experiment.yaml; then run setup and create task lists.')
    return root


def setup(config):
    path = Path(config).resolve()
    cfg = load_config(path)
    runtime = (path.parent / cfg['runtime']).resolve()
    subprocess.run(['npm', 'install', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund'],
                   cwd=runtime, check=True)
    print('Native DSH runtime installed.')


def download_alfworld(directory):
    root = Path(directory).resolve()
    cache = root / '.downloads'
    cache.mkdir(parents=True, exist_ok=True)
    urls = [
        'https://github.com/alfworld/alfworld/releases/download/0.2.2/json_2.1.1_json.zip',
        'https://github.com/alfworld/alfworld/releases/download/0.4.2/json_2.1.3_tw-pddl.zip',
    ]
    for url in urls:
        archive = cache / url.rsplit('/', 1)[-1]
        if not archive.exists():
            print('Downloading ' + archive.name, flush=True)
            temporary = archive.with_suffix('.partial')
            urllib.request.urlretrieve(url, temporary)
            temporary.replace(archive)
        with zipfile.ZipFile(archive) as source:
            source.extractall(root)
    print('Set benchmark.environment.data_root to ' + str(root / 'json_2.1.1'))


def inventory(config, train_limit, test_limit, seeds):
    path = Path(config).resolve()
    cfg = load_config(path)
    if cfg['benchmark']['kind'] != 'alfworld':
        raise ValueError('For python/command benchmarks, write task_id/trial/seed JSONL task lists directly')
    data = Path(os.path.expandvars(cfg['benchmark']['environment']['data_root'])).expanduser().resolve()
    for split, directory, limit in [('train', 'train', train_limit), ('test', 'valid_unseen', test_limit)]:
        groups = {}
        for game in sorted((data / directory).rglob('game.tw-pddl')):
            trajectory = game.parent / 'traj_data.json'
            if not trajectory.exists() or 'movable' in str(game) or 'Sliced' in str(game):
                continue
            if not json.loads(game.read_text()).get('solvable'):
                continue
            kind = json.loads(trajectory.read_text()).get('task_type', 'unknown')
            groups.setdefault(kind, []).append(str(game.parent.relative_to(data)))
        if not groups:
            raise ValueError(f'No usable games in {data / directory}; download ALFWorld data first')
        rng = random.Random(300)
        for values in groups.values():
            rng.shuffle(values)
        # Interleave task types so a small initial list does not contain just one family.
        picked = []
        while any(groups.values()) and (limit <= 0 or len(picked) < limit):
            for kind in sorted(groups):
                if groups[kind] and (limit <= 0 or len(picked) < limit):
                    picked.append(groups[kind].pop())
        rows = [{'task_id': task, 'trial': i, 'seed': seed} for task in picked for i, seed in enumerate(seeds)]
        target = path.parent / cfg['benchmark'][split]
        if (path.parent / cfg['output'] / 'experiment.json').exists():
            raise ValueError('Experiment already started; create a new project to change task lists')
        target.write_text(''.join(json.dumps(r) + '\n' for r in rows))
        print(f'{split}: {len(picked)} tasks × {len(seeds)} repeats = {len(rows)} episodes')


def demo(directory):
    from .demo import ScriptedProvider
    root = init(directory, 'demo')
    path = root / 'experiment.yaml'
    cfg = load_config(path)
    cfg['rounds'] = 1
    cfg['benchmark'].update(max_steps=8, max_model_calls=8, timeout_seconds=30)
    cfg['benchmark']['model'].update(name='offline-scripted-provider', api_key_env='', max_retries=0)
    with ScriptedProvider() as endpoint:
        cfg['benchmark']['model']['base_url'] = endpoint
        path.write_text(yaml.safe_dump(cfg, sort_keys=False))
        setup(path)
        project = Project(path)
        project.evaluate('baseline')
        project.prepare('v01', 'baseline')
        candidate = project.candidate('v01')
        shutil.copy2(ASSETS / 'example-plugins/one-recovery.mjs', candidate / 'plugins/one-recovery.mjs')
        write(candidate / 'composition.json', {'methods': [{'id': 'one-recovery', 'module': 'plugins/one-recovery.mjs', 'config': {}}], 'selected': ['one-recovery']})
        project.evaluate('v01')
        project.decide('v01', True, 'Offline installation fixture: actual native denial and recovery; not learned behavior.')
        project.finish()
    print('DEMO ONLY: native DSH pipeline ran; model and candidate were scripted. No real benchmark gain claimed.')


def main():
    parser = argparse.ArgumentParser(description='Astra autonomous plugin evolution, version 2')
    subs = parser.add_subparsers(dest='action', required=True)
    child = subs.add_parser('init');child.add_argument('directory');child.add_argument('--bench', choices=['alfworld', 'python', 'command'], default='alfworld')
    child = subs.add_parser('demo');child.add_argument('directory')
    child = subs.add_parser('download-alfworld');child.add_argument('directory')
    for action in ['setup', 'run', 'status', 'finish']:
        child = subs.add_parser(action);child.add_argument('config', nargs='?', default='experiment.yaml')
    child = subs.add_parser('inventory');child.add_argument('config');child.add_argument('--train-limit', type=int, default=30);child.add_argument('--test-limit', type=int, default=40);child.add_argument('--seeds', default='11,22,33')
    child = subs.add_parser('prepare');child.add_argument('config');child.add_argument('candidate');child.add_argument('--parent', required=True)
    child = subs.add_parser('evaluate');child.add_argument('config');child.add_argument('candidate');child.add_argument('--split', choices=['train','validation','test','development','all'], default='all');child.add_argument('--batch',type=int)
    child = subs.add_parser('report');child.add_argument('config');child.add_argument('candidate')
    child = subs.add_parser('decide');child.add_argument('config');child.add_argument('candidate');choice=child.add_mutually_exclusive_group(required=True);choice.add_argument('--adopt',action='store_true');choice.add_argument('--reject',action='store_true');child.add_argument('--reason',required=True)
    args = parser.parse_args()
    try:
        if args.action == 'init':
            init(args.directory,args.bench)
        elif args.action == 'demo':
            demo(args.directory)
        elif args.action == 'setup':
            setup(args.config)
        elif args.action == 'download-alfworld':
            download_alfworld(args.directory)
        elif args.action == 'inventory':
            inventory(args.config,args.train_limit,args.test_limit,[int(x) for x in args.seeds.split(',')])
        else:
            project = Project(args.config)
            if args.action == 'run':
                from .keeper import run
                run(project)
            elif args.action == 'prepare':
                project.prepare(args.candidate,args.parent)
            elif args.action == 'evaluate':
                project.evaluate(args.candidate,args.split,args.batch)
            elif args.action == 'report':
                report=project.report(args.candidate)
                print(json.dumps({k: report[k] for k in ['parent','candidate','before','after','improvement','eligible_to_adopt','observed_changed_plugins']},ensure_ascii=False,indent=2))
            elif args.action == 'decide':
                project.decide(args.candidate,args.adopt,args.reason)
            elif args.action == 'finish':
                project.finish()
            elif args.action == 'status':
                print('Best:',project.best())
                for name in ['keeper-status.json','evaluation-status.json','final.json']:
                    p=project.root/name
                    if p.exists():
                        print(name,json.dumps(read(p),ensure_ascii=False))
    except (OSError,ValueError,KeyError,RuntimeError,subprocess.CalledProcessError) as exc:
        parser.exit(1, f'astra-evolve: {exc}\n')
