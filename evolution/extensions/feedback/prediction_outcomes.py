"""Read-only pairing of frozen predictions with same-task native candidate outcomes."""
import json
import sqlite3
import time
from collections import Counter, defaultdict
from pathlib import Path
import yaml
from study_inventory import ROOT, read, write
from scope import SCOPE, feedback_groups


def summarize(rows):
    paired = [r for r in rows if r['status'] == 'paired']
    scored = [r for r in paired if r['timing_status'] == 'recorded_pre_dispatch']
    weight = sum(1 / r['sampling_probability'] for r in scored)
    return {
        'samples': len(rows), 'status_counts': dict(Counter(r['status'] for r in rows)),
        'paired': len(paired), 'recorded_pre_dispatch': len(scored),
        'timing_unverified': len(paired) - len(scored),
        'weighted_brier': sum(r['brier'] / r['sampling_probability'] for r in scored) / weight if weight else None,
        'weighted_parent_persistence_brier': sum(r['parent_persistence_brier'] / r['sampling_probability'] for r in scored) / weight if weight else None,
        'observed_transitions': dict(Counter(r['actual_transition'] for r in paired)),
    }


def main():
    db = sqlite3.connect(f'file:{ROOT / "analysis/observations.sqlite"}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    labels = {}
    for r in read(ROOT / 'analysis/semantic-labels.json', {}).get('observations', []):
        labels[(r['group_id'], r['version'], str(r['task_id']), r['trial'], r['seed'])] = r['labels']
    rows = []; by_group = defaultdict(list)
    for group in feedback_groups():
        cfg = yaml.safe_load((Path(group['path']) / 'experiment.yaml').read_text())
        batch_count = len(cfg.get('benchmark', {}).get('train_batches', []))
        for mapping_path in sorted((ROOT / 'analysis/online' / cfg['name']).glob('v*/prediction-mapping.json')):
            mapping = read(mapping_path); version = mapping['candidate']
            result = read(mapping_path.with_name('prediction-result.json'), {})
            if result.get('status') != 'complete':
                continue
            dispatch = read(mapping_path.with_name('native-dispatch.json'), {})
            finished = result.get('finished_at')
            timing = 'recorded_pre_dispatch' if finished is not None and dispatch.get('time') is not None and finished <= dispatch['time'] else 'unverified'
            predictions = {r['observation_id']: r for r in result['output']['observations']}
            decision = db.execute('SELECT adopted FROM decisions WHERE group_id=? AND version=?', (group['id'], version)).fetchone()
            batch = f'batch-{(int(version[1:]) - 1) % batch_count + 1:02d}' if batch_count else ''
            for sample in mapping['samples']:
                prediction = predictions.get(sample['observation_id'], {})
                probability = prediction.get('predicted_success_probability')
                row = {'group_id': group['id'], 'benchmark': group['benchmark'], 'condition': group['method'],
                       'version': version, 'parent': mapping['parent'], **sample, 'timing_status': timing,
                       'prediction_finished_at': finished, 'recorded_dispatch_at': dispatch.get('time'),
                       'prediction': prediction, 'adopted': bool(decision['adopted']) if decision else None,
                       'mapping_path': str(mapping_path), 'status': 'awaiting_native_decision'}
                if decision is not None:
                    actual = db.execute('''SELECT a.valid AS candidate_valid,b.valid AS parent_valid,
                      a.success AS after,b.success AS before,a.score AS candidate_score,
                      a.actions != b.actions AS behavior_changed,a.source AS candidate_source,b.source AS parent_source
                      FROM observations a JOIN observations b ON a.group_id=b.group_id
                      AND a.task_id=b.task_id AND a.trial=b.trial AND a.seed=b.seed
                      AND a.batch=b.batch AND a.split=b.split
                      WHERE a.group_id=? AND a.version=? AND b.version=? AND a.split='train'
                      AND a.batch=? AND a.task_id=? AND a.trial=? AND a.seed=?''',
                      (group['id'], version, mapping['parent'], batch, str(sample['task_id']), sample['trial'], sample['seed'])).fetchone()
                    if actual is None:
                        row['status'] = 'native_pair_unavailable'
                    elif not actual['candidate_valid'] or not actual['parent_valid']:
                        row['status'] = 'native_pair_invalid'
                    elif bool(actual['before']) != sample['parent_success']:
                        row['status'] = 'parent_outcome_mismatch'
                    elif not isinstance(probability, (float, int)) or isinstance(probability, bool) or not 0 <= probability <= 1:
                        row['status'] = 'prediction_probability_unavailable'
                    else:
                        transition = {(0, 0): 'persistent_failure', (0, 1): 'repair', (1, 0): 'regression', (1, 1): 'retained_success'}
                        row.update(status='paired', **dict(actual), actual_transition=transition[(actual['before'], actual['after'])],
                                   brier=(probability - actual['after']) ** 2,
                                   parent_persistence_brier=(actual['before'] - actual['after']) ** 2,
                                   actual_semantic_labels=labels.get((group['id'], version, str(sample['task_id']), sample['trial'], sample['seed'])))
                rows.append(row); by_group[group['id']].append(row)
    db.close()
    write(ROOT / 'analysis/prediction-outcomes.json', {
        'scope': SCOPE, 'status': 'provisional', 'updated_at': time.time(),
        'summary': summarize(rows), 'groups': {g: summarize(r) for g, r in by_group.items()}, 'observations': rows,
        'interpretation': [
            'Predictions remain analysis-only. No native execution, adoption or feedback is changed.',
            'Same TRAIN task, batch, trial and seed are paired, including rejected candidates. Missing and invalid pairs remain explicit.',
            'Scoring uses inverse inclusion probabilities for the parent success/failure stratified sample. Pooled Brier describes prediction accuracy across decisions, not a performance curve.',
            'Recorded pre-dispatch means prediction completion precedes the saved wrapper dispatch. Early missing dispatch records are timing-unverified; a saved dispatch alone cannot establish that no earlier execution occurred.',
            'Semantic labels are reported only when an existing independently sampled annotation matches the exact episode; absent labels are unknown. Textual falsifiers and mechanism hypotheses are not automatically adjudicated.',
            'Analysis is incomplete until all ten arms, semantic annotations and final independent tests finish; single optimization trajectories do not establish stable superiority.',
        ]})
    print(json.dumps(summarize(rows)))


if __name__ == '__main__':
    main()
