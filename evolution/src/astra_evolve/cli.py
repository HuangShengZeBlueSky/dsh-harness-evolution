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
