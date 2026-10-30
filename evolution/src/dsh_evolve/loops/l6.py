"""L6: diagnosis, current-state understanding, repair planning and measured effects."""
from pathlib import Path
from collections import Counter
import argparse, fcntl, json, shutil, time
from astra_evolve.project import Project
from astra_evolve.records import read, write, summary, key, changes, selected, runtime_evidence


class Campaign(Project):
    def prepare(self, name, parent=None):
        parent = parent or self.best()
        super().prepare(name, parent)
        destination = self.candidate(name)
        for filename in ('analysis.json', 'agent-inventory.json'):
            (destination / filename).unlink(missing_ok=True)
        comp = read(self.root / 'frozen' / parent / 'composition.json')
        inventory = {'parent': parent, 'batch': self.batch(name),
                     'active_plugins': [m for m in comp['methods'] if m['id'] in comp['selected']],
                     'evidence': str(self.base / 'materials' / parent / f'batch-{self.batch(name):02d}'),
                     'note': 'Source/config facts only. Read actual plugin code and TRAIN trajectories to explain capability and state.'}
        write(destination / 'agent-inventory.json', inventory)
        print('Read parent code and training evidence, write analysis.json, then run plan before editing plugins.')

    def plan(self, name):
        candidate = self.candidate(name)
        parent = read(candidate / 'parent.json')['parent']
        target = self.base / 'materials' / name / 'repair-plan.json'
        if target.exists():
            print('Plan already recorded; implement it or use the next candidate.'); return
        delta = changes(self.root / 'frozen' / parent, candidate)
        if delta['changed_active'] or delta['removed']:
            raise ValueError('Record diagnosis and repair plan before changing the active plugins.')
        if read(candidate / 'composition.json') != read(self.root / 'frozen' / parent / 'composition.json'):
            raise ValueError('Record plan before changing plugin composition.')
        analysis = read(candidate / 'analysis.json')
        if analysis.get('parent') != parent or not str(analysis.get('agent_state', '')).strip():
            raise ValueError('Explain the current parent agent capabilities, state ownership and gaps in agent_state.')
        rows = self.rows(parent, 'train', self.batch(name))
        by_task = {r['task_id']: r for r in rows}
        clusters = analysis.get('clusters', [])
        if not clusters or not analysis.get('repairs'):
            raise ValueError('Provide problem clusters and their repair-plugin mapping.')
        ids = set()
        for cluster in clusters:
            if not cluster.get('id') or cluster['id'] in ids:
                raise ValueError('Use distinct problem cluster IDs.')
            ids.add(cluster['id'])
            if not cluster.get('hypothesis') or not cluster.get('members') or not cluster.get('evidence'):
                raise ValueError('Each cluster needs a cause hypothesis, affected tasks and specific trace evidence.')
            if any(t not in by_task for t in cluster['members'] + cluster.get('controls', [])):
                raise ValueError('Cluster membership and controls must refer to this complete TRAIN batch.')
            for evidence in cluster['evidence']:
                task = evidence['task_id']; index = evidence['message_index']
                if task not in cluster['members'] + cluster.get('controls', []) or not evidence.get('observation'):
                    raise ValueError('Trace evidence must point to a cluster member or matched control.')
                if not isinstance(index, int) or not 0 <= index < len(by_task[task]['messages']):
                    raise ValueError('message_index must refer to an actual parent TRAIN message.')
        for repair in analysis['repairs']:
            if repair.get('cluster_id') not in ids or not repair.get('plugin_ids'):
                raise ValueError('Map each repair to an existing cluster and one or more plugins.')
            for field in ('operation', 'hooks', 'trigger', 'state_change', 'expected_behavior'):
                if not repair.get(field):
                    raise ValueError('Explain repair ' + field)
            if any(t not in by_task for t in repair.get('at_risk_tasks', [])):
                raise ValueError('At-risk tasks must come from this TRAIN batch.')
        write(target, {**analysis, 'batch': self.batch(name), 'recorded_at': time.time(),
                       'note': 'Hypotheses and predictions, not proven causes or effects.'})
        print('Diagnosis and repair plan recorded. Now implement the candidate.')

    def evaluate(self, name, split='development', batch=None):
        if split == 'test':
            seal = read(self.root / 'final-checkpoint.json') if (self.root / 'final-checkpoint.json').exists() else {}
            if seal.get('candidate') != name:
                raise ValueError('Test only the sealed final selected checkpoint after all rounds.')
        if name != 'baseline' and not (self.base / 'materials' / name / 'repair-plan.json').exists():
            raise ValueError('Run plan before implementing and evaluating this candidate.')
        return super().evaluate(name, split, batch)

    def report(self, name, parent=None):
        report = super().report(name, parent)
        parent = report['parent']; batch = self.batch(name)
        before, after = self.rows(parent, 'train', batch), self.rows(name, 'train', batch)
        plan = read(self.base / 'materials' / name / 'repair-plan.json')
        old = {key(r): r for r in before}
        success = lambda rows: sum(r['score'] >= 1 for r in rows) / len(rows)
        pairs = []
        for row in after:
            prior = old[key(row)]
            pairs.append({'task_id': row['task_id'], 'trial': row['trial'],
                          'before': prior['score'] >= 1, 'after': row['score'] >= 1,
                          'outcome': 'repaired' if prior['score'] < 1 <= row['score'] else
                          'regressed' if row['score'] < 1 <= prior['score'] else 'unchanged',
                          'tool_sequence_changed': self.actions(prior) != self.actions(row)})
        plugins = report['runtime']['plugins']
        for ident, stats in plugins.items():
            stats['hook_events'] = dict(Counter(e.get('hook', 'unknown') for row in after
                for e in row.get('activations', []) if e.get('method_id') == ident and e.get('hook') != 'loaded'))
            stats['hook_event_source'] = 'plugin audit; input matches and runner receipts are separate evidence'
        cluster_results = []
        for cluster in plan['clusters']:
            member_pairs = [p for p in pairs if p['task_id'] in cluster['members']]
            repairs = [r for r in plan['repairs'] if r['cluster_id'] == cluster['id']]
            plugin_ids = sorted({p for r in repairs for p in r['plugin_ids']})
            target_rows = [r for r in after if r['task_id'] in cluster['members']]
            observed = runtime_evidence(target_rows, [i for i in plugin_ids if i in plugins])['plugins']
            cluster_results.append({'id': cluster['id'], 'hypothesis': cluster['hypothesis'],
                'tasks': len(member_pairs), 'repaired': sum(p['outcome'] == 'repaired' for p in member_pairs),
                'regressed': sum(p['outcome'] == 'regressed' for p in member_pairs),
                'behavior_changed': sum(p['tool_sequence_changed'] for p in member_pairs),
                'plugins': plugin_ids, 'runtime_on_target_tasks': observed, 'paired': member_pairs})
        changed = set(report['changes']['changed_active']) | set(report['changes']['removed'])
        planned = {p for r in plan['repairs'] for p in r['plugin_ids']}
        removed = set(report['changes']['removed'])
        removal_evidence = runtime_evidence(before, list(removed))['plugins'] if removed else {}
        observed_removals = [p for p, e in removal_evidence.items() if e['request_hits'] or e['control_receipts']]
        effect = bool(report['observed_changed_plugins'] or observed_removals)
        eligible = success(after) > success(before) and effect and changed <= planned
        failed = {r['task_id'] for r in before if r['score'] < 1}
        covered = {t for c in plan['clusters'] for t in c['members']} & failed
        at_risk = {t for r in plan['repairs'] for t in r.get('at_risk_tasks', [])}
        metrics = {'parent': parent, 'candidate': name, 'batch': batch,
            'selection_metric': 'strict_success', 'before': success(before), 'after': success(after),
            'net_successes': sum(p['after'] - p['before'] for p in pairs),
            'repaired': sum(p['outcome'] == 'repaired' for p in pairs),
            'regressed': sum(p['outcome'] == 'regressed' for p in pairs),
            'diagnosed_failed_tasks': len(covered), 'parent_failed_tasks': len(failed),
            'clusters': cluster_results, 'runtime': plugins, 'removed_plugin_parent_effects': removal_evidence,
            'predicted_regressions_observed': sum(p['outcome']=='regressed' and p['task_id'] in at_risk for p in pairs),
            'unplanned_changes': sorted(changed - planned), 'eligible_to_adopt': eligible,
            'paired': pairs, 'at': time.time(),
            'interpretation': 'Trace references prove evidence exists, not understanding. Hook counts are self-reported; request matches prove exposure; runner receipts prove control; task gains do not isolate plugin causality.'}
        write(self.base / 'materials' / name / 'loop-metrics.json', metrics)
        report.update(eligible_to_adopt=eligible, selection_metric='strict_success', loop_metrics=metrics)
        write(self.base / 'materials' / name / 'loop-comparison.json', report)
        return report

    @staticmethod
    def actions(row):
        return [m.get('tool_calls') for m in row.get('messages', []) if m.get('role') == 'assistant' and m.get('tool_calls')]

    def decide(self, name, adopt, reason):
        target = self.root / 'decisions' / (name + '.json')
        if target.exists() or (self.root / 'final-checkpoint.json').exists():
            raise ValueError('Decision exists or final selection is sealed.')
        report = self.report(name)
        if adopt and (report['parent'] != self.best() or not report['eligible_to_adopt']):
            raise ValueError('Require complete same-batch strict success gain and actual planned plugin effect.')
        if adopt:
            write(self.root / 'best.json', {'candidate': name})
        m = report['loop_metrics']
        write(target, {'candidate': name, 'parent': report['parent'], 'adopted': adopt,
            'champion_changed': adopt, 'training': report['after'], 'validation': None,
            'selection_metric': 'strict_success', 'loop': self.cfg['loop']['variant'], 'reason': reason, 'at': time.time(),
            'loop_metrics': {k:m[k] for k in ['before','after','net_successes','repaired','regressed',
                'diagnosed_failed_tasks','parent_failed_tasks','unplanned_changes']}})
        write(self.root / 'loop-metrics-latest.json', m)
        print(json.dumps({'adopted': adopt, 'best': self.best(), 'repaired': m['repaired'], 'regressed': m['regressed']}))

    def finish(self):
        self.root.mkdir(exist_ok=True)
        with (self.root / 'finish.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            if (self.root / 'completed.txt').exists(): return
            self.require_decisions(); best = self.best()
            write(self.root / 'final-checkpoint.json', {'candidate': best, 'rounds': self.cfg['rounds'], 'at': time.time()})
            self.evaluate(best, 'test')
            write(self.root / 'final.json', {'rounds': self.cfg['rounds'], 'best': best, 'loop': self.cfg['loop']['variant'],
                'train': {'best': summary(self.rows(best, 'train'))},
                'test': {'best': summary(self.rows(best, 'test'))}, 'selection_metric': 'strict_success',
                'test_policy': 'only final training-selected checkpoint', 'startpoint': 'H0'})
            if not (self.base / 'best').exists():
                shutil.copytree(self.root / 'frozen' / best, self.base / 'best', ignore=shutil.ignore_patterns('node_modules'))
            (self.root / 'completed.txt').write_text('All rounds and final selected checkpoint test complete\n')

