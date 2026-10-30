"""Commands an autonomous optimizer can invoke. No stage scheduler lives here."""
import fcntl
import json
import re
import shutil
import subprocess
from pathlib import Path

from .config import load_config

from .records import (changes, command, key, load_tasks, materials, paired, read, results,
                      runtime_evidence, selected, snapshot, summary, syntax_check, write)


class Project:
    def __init__(self, config):
        self.path = Path(config).resolve()
        self.base = self.path.parent
        self.cfg = load_config(self.path)
        self.root = (self.base / self.cfg.get("output", "runs")).resolve()
        self.bench = self.cfg["benchmark"]
        self.batches = [load_tasks(self.base / p) for p in self.bench.get('train_batches', [])]
        self.direction = {"maximize": 1, "minimize": -1}[self.bench.get("direction", "maximize")]
        self.tasks = {s: load_tasks(self.base / self.bench[s]) for s in ["train", "validation", "test"] if self.bench.get(s)}
        if 'validation' in self.tasks:
            other = {r['task_id'] for r in self.tasks['train']} | {r['task_id'] for r in self.tasks.get('test', [])}
            if other & {r['task_id'] for r in self.tasks['validation']}:
                raise ValueError('Validation overlaps training or test')
        if "train" not in self.tasks:
            raise ValueError("Training task list is required; run inventory first")
        if "test" in self.tasks and {r['task_id'] for r in self.tasks['train']} & {r['task_id'] for r in self.tasks['test']}:
            raise ValueError("Train/test task IDs overlap")

    def freeze_experiment(self):
        runtime = self.base / self.cfg["runtime"]
        sources = {p.name: p.read_text() for p in runtime.glob('*.mjs')}
        sources['package.json'] = (runtime / 'package.json').read_text()
        if self.bench['kind'] == 'python':
            path = self.bench['environment']['factory'].rsplit(':', 1)[0]
            sources['environment_factory'] = (self.base / path).read_text()
            prompt_file = self.bench.get('environment', {}).get('system_prompt_file')
            if prompt_file:
                sources['environment_system_prompt'] = (self.base / prompt_file).read_text()
        experiment = {"config": self.cfg, "tasks": self.tasks, "train_batches": self.batches, "runtime_sources": sources,
                      "harness_api": (self.base / self.cfg["harness_api"]).read_text()}
        path = self.root / 'experiment.json'
        if path.exists() and read(path) != experiment:
            raise ValueError("Experiment settings/source changed; use a new output directory")
        if not path.exists():
            write(path, experiment)

    def candidate(self, name):
        if name == 'baseline':
            return (self.base / self.cfg.get('baseline', 'baseline')).resolve()
        if not re.fullmatch(r'v\d{2,}', name) or not 1 <= int(name[1:]) <= self.cfg['rounds']:
            raise ValueError('Use baseline or v01…vNN within the configured rounds budget')
        return self.base / 'candidates' / name

    def prepare(self, name, parent):
        self.freeze_experiment()
        destination = self.candidate(name)
        if name == 'baseline' or destination.exists():
            raise ValueError('Candidate already exists or is baseline')
        source = self.root / 'frozen' / parent
        if not source.exists():
            raise ValueError('Evaluate the parent before preparing a candidate')
        batch = self.batch(name)
        self.evaluate(parent, 'train', batch=batch)
        self.rows(parent, 'train', batch=batch)
        shutil.copytree(source, destination, ignore=shutil.ignore_patterns('node_modules'))
        write(destination / 'parent.json', {'parent': parent, 'batch': self.batch(name)})
        print(destination)

    def batch(self, name, requested=None):
        if not self.batches:
            return None
        number = requested or (1 if name == 'baseline' else ((int(name[1:])-1) % len(self.batches) + 1))
        if not 1 <= number <= len(self.batches):
            raise ValueError('Unknown training batch')
        return number

    def task_list(self, name, split, batch=None):
        return self.batches[self.batch(name,batch)-1] if split == 'train' and self.batches else self.tasks[split]

    def folder(self, name, split, batch=None):
        folder = self.root / 'evaluations' / name / split
        return folder / f'batch-{self.batch(name,batch):02d}' if split == 'train' and self.batches else folder

    def rows(self, name, split, batch=None):
        tasks = self.task_list(name,split,batch)
        found = results(self.folder(name,split,batch) / 'episodes.jsonl', tasks)
        if any(found.get(key(t), {}).get('valid') is not True for t in tasks):
            raise RuntimeError(f'{name}/{split}/batch={batch} has missing or infrastructure-error episodes')
        return [found[key(t)] for t in tasks]

    def evaluate(self, name, split='all', batch=None):
        self.freeze_experiment()
        self.root.mkdir(parents=True, exist_ok=True)
        with (self.root / 'evaluation.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            candidate = self.candidate(name)
            target = self.root / 'frozen' / name
            syntax_check(candidate, self.cfg.get('node', 'node'))
            if target.exists():
                if snapshot(candidate) != snapshot(target) or [m['id'] for m in selected(candidate)] != [m['id'] for m in selected(target)]:
                    raise ValueError('This candidate has already been frozen; create the next version')
            else:
                if name != 'baseline' and self.cfg.get('method') == 'luna_multi':
                    parent = read(candidate / 'parent.json')['parent']
                    changed = changes(self.root / 'frozen' / parent, candidate)
                    if len(changed['changed_active']) < 2:
                        raise ValueError('Cooperative M1 (luna_multi) requires at least two changed active plugins')
                shutil.copytree(candidate, target, ignore=shutil.ignore_patterns('node_modules'))
            if self.bench['kind'] != 'command' and not (target / 'node_modules').exists():
                (target / 'node_modules').symlink_to((self.base / self.cfg['runtime'] / 'node_modules').resolve(), target_is_directory=True)
            splits = list(self.tasks) if split == 'all' else [s for s in ['train','validation'] if s in self.tasks] if split == 'development' else [split]
            for part in splits:
                if part not in self.tasks:
                    raise ValueError('No task list for ' + part)
                if part == 'test' and self.cfg.get('test_schedule') == 'final':
                    self.require_decisions()
                    best = self.best()
                    seal_path = self.root / 'training-seal.json'
                    if seal_path.exists():
                        if read(seal_path)['best'] != best:
                            raise RuntimeError('Best changed after training selection was sealed')
                    else:
                        write(seal_path, {'best':best,'rounds':self.cfg['rounds'],
                              'selection':'Training-only; locked before any final test request'})
                    if name not in ['baseline', best] and not read(self.root / 'decisions' / (name+'.json')).get('adopted',False):
                        raise ValueError('Final-only test is restricted to baseline and selected best')
                folder = self.folder(name,part,batch)
                folder.mkdir(parents=True, exist_ok=True)
                output = folder / 'episodes.jsonl'
                tasks = self.task_list(name,part,batch)
                current = results(output, tasks)
                pending = [r for r in tasks if current.get(key(r), {}).get('valid') is not True]
                if pending:
                    req = {'protocol_version': 2, 'candidate': str(target), 'methods': selected(target),
                           'episodes': pending, 'split': part, 'output': str(output),
                           'parameters': self.bench}
                    write(folder / 'request.json', req)
                    write(self.root / 'evaluation-status.json', {'candidate': name, 'split': part, 'status': 'running'})
                    before = (snapshot(target), [m['id'] for m in selected(target)])
                    if self.bench['kind'] == 'command':
                        args = command(self.bench['command']) + ['--request', str(folder / 'request.json')]
                        with (folder / 'adapter.log').open('a') as log:
                            subprocess.run(args, cwd=self.base / self.bench.get('cwd', '.'),
                                           stdout=log, stderr=subprocess.STDOUT, check=True)
                    else:
                        from .native import run_native
                        run_native(self.cfg, self.base, req)
                    if (snapshot(target), [m['id'] for m in selected(target)]) != before:
                        raise RuntimeError('Candidate changed during evaluation')
                rows = self.rows(name, part, batch)
                write(folder / 'summary.json', summary(rows))
                if part == 'train':
                    out = self.base / 'materials' / name
                    if self.batches:
                        out = out / f'batch-{self.batch(name,batch):02d}'
                    materials(rows, out, self.bench.get('success_score', 1), self.direction)
                    evidence = runtime_evidence(rows, [m['id'] for m in selected(target)])
                    write(out / 'runtime.json', evidence)
                    write(out / 'runtime-records.json', [{k: row.get(k) for k in
                          ['task_id', 'trial', 'seed', 'requests', 'activations', 'executions']} for row in rows])
                print(f'{name}/{part}: mean={summary(rows)["mean"]:.4f}, completed={len(rows)}', flush=True)
            write(self.root / 'evaluation-status.json', {'candidate': name, 'status': 'complete'})

    def report(self, name, parent=None):
        parent = parent or read(self.candidate(name) / 'parent.json')['parent']
        batch = self.batch(name)
        before, after = self.rows(parent, 'train', batch), self.rows(name, 'train', batch)
        frozen = self.root / 'frozen'
        changed = changes(frozen / parent, frozen / name)
        if [m['id'] for m in selected(frozen / parent)] != [m['id'] for m in selected(frozen / name)] and not changed['changed_active'] and not changed['removed']:
            changed['changed_active'] = [m['id'] for m in selected(frozen / name)]
            changed['order_changed'] = True
        evidence = runtime_evidence(after, [m['id'] for m in selected(frozen / name)])
        observed = [i for i in changed['changed_active'] if evidence['plugins'][i]['request_hits'] or evidence['plugins'][i]['control_receipts']]
        improvement = (summary(after)['mean'] - summary(before)['mean']) * self.direction
        report = {'batch': batch, 'parent': parent, 'candidate': name, 'before': summary(before), 'after': summary(after),
                  'paired': paired(before, after, self.direction), 'changes': changed,
                  'runtime': evidence, 'observed_changed_plugins': observed, 'improvement': improvement,
                  'eligible_to_adopt': improvement > self.cfg.get('min_improvement', 0) and bool(observed)}
        write(self.base / 'materials' / name / 'comparison.json', report)
        return report

    def best(self):
        path = self.root / 'best.json'
        return read(path)['candidate'] if path.exists() else 'baseline'

    def decide(self, name, adopt, reason):
        if (self.root / 'training-seal.json').exists():
            raise RuntimeError('Training selection is sealed; no decisions may change after testing begins')
        self.freeze_experiment()
        report = self.report(name)
        if adopt:
            if report['parent'] != self.best():
                raise ValueError('Adoption must compare against the current best parent')
            if not report['eligible_to_adopt']:
                raise ValueError('No full training improvement with observed changed-plugin effect')
            write(self.root / 'best.json', {'candidate': name})
        write(self.root / 'decisions' / (name + '.json'), {'candidate': name, 'parent': report['parent'],
              'adopted': adopt, 'reason': reason, 'training': report['after']})
        print(f'{name}: {"adopted" if adopt else "rejected"}; best={self.best()}')

    def require_decisions(self):
        for i in range(1, self.cfg['rounds'] + 1):
            name = f'v{i:02d}'
            self.rows(name, 'train')
            if not (self.root / 'decisions' / (name + '.json')).exists():
                raise RuntimeError('Missing explicit optimizer selection for ' + name)

    def finish(self):
        self.freeze_experiment()
        self.require_decisions()
        best = self.best()
        # Final train comparison uses the same first batch, after selection is finished.
        self.evaluate(best, 'train', batch=1 if self.batches else None)
        score = {'batch': 1 if self.batches else None, 'baseline': summary(self.rows('baseline', 'train', 1 if self.batches else None)), 'best': summary(self.rows(best, 'train', 1 if self.batches else None))}
        testing = None
        validation = None
        if 'validation' in self.tasks:
            for name in ['baseline'] + [f'v{i:02d}' for i in range(1, self.cfg['rounds'] + 1)]:
                self.rows(name, 'validation')
            validation = {'baseline': summary(self.rows('baseline', 'validation')), 'best': summary(self.rows(best, 'validation'))}
        if 'test' in self.tasks:
            names = ['baseline'] + [f'v{i:02d}' for i in range(1, self.cfg['rounds'] + 1)] if self.cfg.get('test_schedule') == 'each_version' else list(dict.fromkeys(['baseline', best]))
            for name in names:
                self.rows(name, 'test')
            testing = {'baseline': summary(self.rows('baseline', 'test')), 'best': summary(self.rows(best, 'test')),
                       'paired': paired(self.rows('baseline', 'test'), self.rows(best, 'test'), self.direction)}
        destination = self.base / 'best'
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(self.root / 'frozen' / best, destination, ignore=shutil.ignore_patterns('node_modules'))
        write(self.root / 'final.json', {'best': best, 'train': score, 'test': testing,
              'validation': validation, 'rounds': self.cfg['rounds'], 'demo': self.bench['kind'] == 'demo'})
        (self.root / 'completed.txt').write_text(f'Completed {self.cfg["rounds"]} candidates. Best: {best}\n')
        print('Completed; reusable plugins: ' + str(destination))
