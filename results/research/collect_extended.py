"""Read native campaigns and usage ledgers; export public numeric records only."""
from pathlib import Path
from collections import defaultdict, Counter
from datetime import datetime, timezone
import json, sys, importlib.util, re, time, bisect, argparse
import yaml

R = Path(__file__).resolve().parent
ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--root', type=Path, required=True)
ap.add_argument('--output', type=Path, required=True)
ap.add_argument('--session-root', type=Path, action='append', default=[])
a = ap.parse_args()
D = a.root.resolve()
OUT = a.output.resolve()
OUT.mkdir(exist_ok=True)
spec = importlib.util.spec_from_file_location('native_export', R / 'collect.py')
C = importlib.util.module_from_spec(spec)
spec.loader.exec_module(C)

def read(p, default=None):
    if p.exists():
        return json.loads(p.read_text())
    return {} if default is None else default

def save(p, x):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(x, ensure_ascii=False, indent=2) + '\n')

seed = read(R / 'runs-seed.json' if (R / 'runs-seed.json').exists() else R / 'runs.json').get('runs', [])
C.CACHE.update({x['id']: x for x in seed})
C.CACHE.update({x['id']: x for x in read(OUT / 'runs.json').get('runs', [])})
historical = read(R / 'historical-curves.json').get('groups', [])
paths = set()
for x in seed:
    paths.add(D / x.get('source_locator', x['id']))
for x in historical:
    if '#stage' not in x['id']:
        paths.add(D / x['id'])
campaigns = [
    'loop-comparison-20r-20261025', 'loop-expansion-sol40-20261026',
    'loop-l6-attribution-40r-20261026', 'loop-l789-sol40-20261026',
    'method2-playbook-30r-20261024',
]
for name in campaigns:
    paths.update(p.parent for p in (D / name).glob('*/*/experiment.yaml'))
for name in ['alfworld-official50-20r-20261022', 'dbbench-methods-20r-20261023',
             'webshop-methods-20r-20261023', 'os-life-aligned-20r-20261023']:
    paths.update(p.parent for p in (D / name).glob('method*/experiment.yaml'))
for name in ['simple-dsh-l4-fixed40-20261030', 'l4-fixed100-sol61-high-20261102',
             'architecture-luna8-fourbench-20261101', 'failure-frontier-fivebench-20261029']:
    paths.update(p.parent for p in (D / name / 'experiments').glob('*/*/experiment.yaml')
                 if p.parent.name not in ['shared-baseline'] and
                 (name != 'failure-frontier-fivebench-20261029' or p.parent.name in ['dsh-summary', 'dsh-mechanism']))

# Existing evaluation-only queues are another source of measured checkpoint results.
backfill = defaultdict(list)
for dirname in ['adopted-checkpoint-tests-20261023', 'high-value-checkpoint-tests-20261026',
                'promoted-checkpoint-tests-20261102']:
    state = read(D / dirname / 'state.json')
    records = state.get('jobs', [])
    if isinstance(records, dict):
        records = list(records.values())
    for j in records:
        legacy_root = {'alfworld': 'alfworld-official50-20r-20261022',
                       'dbbench': 'dbbench-methods-20r-20261023',
                       'webshop': 'webshop-methods-20r-20261023',
                       'osbench': 'os-life-aligned-20r-20261023'}.get(j.get('domain'))
        if not j.get('group_root') and legacy_root and j.get('group'):
            j['group_root'] = str(D / legacy_root / j['group'])
        if j.get('group_root') and j.get('version') and j.get('output'):
            backfill[(str(Path(j['group_root']).resolve()), j['version'])].append(Path(j['output']))

session_files = {}
for home in a.session_root or [Path.home() / '.codex/sessions']:
    for p in Path(home).glob('2026/*/*/rollout-*.jsonl'):
        sid = p.stem[-36:]
        session_files.setdefault(sid, []).append(p)

def timestamp(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp()

def normalized_usage(u):
    keys = ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens']
    x = {k: int(u.get(k, 0)) for k in keys}
    x['uncached_input_tokens'] = max(0, x['input_tokens'] - x['cached_input_tokens'])
    x['total_tokens'] = x['input_tokens'] + x['output_tokens']
    return x

def usage(base, cfg, points):
    sessions = {}
    sidfile = base / 'runs/session.txt'
    if sidfile.exists():
        sessions[sidfile.read_text().strip()] = []
    for p in sorted((base / 'runs').glob('turn-*-events.jsonl')):
        sid = None
        for line in p.open():
            if 'thread.started' not in line and 'turn.completed' not in line:
                continue
            e = json.loads(line)
            if e.get('type') == 'thread.started':
                sid = e['thread_id']
                sessions.setdefault(sid, [])
            elif e.get('type') == 'turn.completed' and e.get('usage') and sid:
                sessions[sid].append(normalized_usage(e['usage']))
    totals = []
    samples = []
    sources = Counter()
    for sid, cli in sessions.items():
        found = []
        for p in session_files.get(sid, []):
            for line in p.open():
                if 'token_count' not in line:
                    continue
                try:
                    e = json.loads(line)
                except ValueError:
                    continue
                pl = e.get('payload', {})
                u = (pl.get('info') or {}).get('total_token_usage')
                if e.get('type') == 'event_msg' and pl.get('type') == 'token_count' and u:
                    found.append((timestamp(e['timestamp']), normalized_usage(u)))
        if found:
            found.sort(key=lambda x: x[0])
            # Cumulative snapshots, not turn-by-turn bills. Never sum them.
            totals.append(max((u for _, u in found), key=lambda u: u['total_tokens']))
            samples.extend((at, sid, u) for at, u in found)
            sources['session_cumulative'] += 1
        elif cli:
            totals.append(max(cli, key=lambda u: u['total_tokens']))
            sources['cli_completed_session'] += 1
    total = {k: sum(u[k] for u in totals) for k in totals[0]} if totals else None
    if samples:
        samples.sort(key=lambda x: x[0])
        for p in points:
            if not p.get('at'):
                continue
            seen = {}
            for at, sid, u in samples:
                if at > p['at']:
                    break
                seen[sid] = u
            if seen:
                p['optimizer_usage_at_decision'] = {k: sum(u[k] for u in seen.values()) for k in next(iter(seen.values()))}
    learning = []
    learning_files = set()
    for parent in [base, *list(base.parents)[:3]]:
        learning_files.update((parent / 'learning-jobs').glob(str(cfg.get('name', '__none__')) + '-*/attempt-*-result.json'))
    for p in sorted(learning_files):
        for e in read(p).get('events', []):
            if e.get('type') == 'turn.completed' and e.get('usage'):
                learning.append(normalized_usage(e['usage']))
    learn = {k: sum(u[k] for u in learning) for k in learning[0]} if learning else None
    return {'optimizer': total, 'learning': learn, 'sessions_observed': len(totals),
            'sessions_registered': len(sessions), 'sources': dict(sources),
            'scope': 'Observed session cumulative input+output; cached input is included in input, reasoning is included in output. Missing session logs retain available completed-session CLI totals. Reused historical starts and actor evaluation are excluded. Decision samples use the latest earlier usage report, not interpolation.'}

def summary(p, bench, expected):
    s = read(p)
    if s.get('valid') != expected or s.get('invalid', 0):
        return None
    value = s.get('strict_pass_at_1') if bench == 'webshop' else s.get('strict_pass_at_1', s.get('mean'))
    if value is None:
        return None
    return {'strict_pass_at_1': value, 'mean_reward': s.get('mean'),
            'valid_episodes': expected, 'expected_episodes': expected,
            'strict_successes': s.get('strict_successes', round(value * expected)),
            'repeat_means': s.get('repeat_means'), 'mean_reward_repeat_population_std': s.get('repeat_standard_deviation'),
            'source': 'native_summary', 'complete': True}

groups, queue, errors = [], [], []
for base in sorted(paths):
    if not (base / 'experiment.yaml').exists():
        continue
    cfg = yaml.safe_load((base / 'experiment.yaml').read_text())
    ident = base.relative_to(D).as_posix()
    try:
        r = C.collect_group(base, D, OUT, ident, 'feedback' if '/dsh-' in ident and 'failure-frontier' in ident else 'mainline')
    except Exception as e:
        errors.append({'id': ident, 'error': type(e).__name__ + ': ' + str(e)[:180]})
        continue
    for native_bench, prefix in [('alfworld', 'alfworld-official50-20r-20261022'),
                                 ('dbbench', 'dbbench-methods-20r-20261023'),
                                 ('webshop', 'webshop-methods-20r-20261023'),
                                 ('osbench', 'os-life-aligned-20r-20261023')]:
        if ident.startswith(prefix + '/'):
            r['benchmark'] = native_bench
    if r['benchmark'] not in ['alfworld', 'dbbench', 'webshop', 'osbench', 'telecom']:
        continue
    if ident.startswith('simple-dsh-l4-fixed40'):
        r['collection'] = 'fixed100_simple'
        r['method_id'] = 'L4_simple'
    elif ident.startswith('l4-fixed100-sol61'):
        r['collection'] = 'l4_fixed100_reproduction'
        r['method_id'] = 'L4_fixed100'
    elif ident.startswith('architecture-luna8'):
        r['collection'] = 'architecture_pilot'
        r['method_id'] = 'pilot_' + str(cfg.get('architecture_arm', cfg.get('arm', base.name)))
    elif ident.startswith('method2-playbook'):
        r['collection'] = 'playbook'
        r['method_id'] = 'playbook'
    elif '/method' in ident and ('methods-' in ident or 'alfworld-official50' in ident):
        r['collection'] = 'early_methods'
        h = next((g for g in historical if g['id'] == ident), {})
        r['method_id'] = h.get('method_id', h.get('family', r.get('method_id')))
    r['startpoint'] = r.get('startpoint') or cfg.get('baseline', 'baseline')
    r['state'] = C.clean(read(base / 'worker-status.json'))
    r['current_champion'] = read(base / 'runs/best.json').get('candidate')
    expected = r.get('split_counts', {}).get('test', {}).get('episodes')
    if ident.startswith('alfworld-official50-20r-20261022/'):
        # The original manifest is one 109-task pass; published checkpoint
        # supplements use the established three-trial 327-episode protocol.
        expected = 327
        r['checkpoint_test_protocol'] = {'tasks': 109, 'trials': 3, 'episodes': 327,
                                          'note': 'Three-trial supplement; original one-pass records remain in final_selection.'}
    if not expected:
        expected = {'dbbench': 900, 'webshop': 600, 'osbench': 432, 'alfworld': 327, 'telecom': 120}[r['benchmark']]
    final = (r.get('final_selection') or {}).get('best')
    native_eval = base / 'runs/evaluations'
    baseline = summary(native_eval / 'baseline/test/summary.json', r['benchmark'], expected)
    r['baseline_test'] = baseline
    all_points = r['curve']
    tested = 0
    for p in all_points:
        version = p['version']
        candidates = [(native_eval / version / 'test/summary.json', 'native')]
        for q in backfill.get((str(base.resolve()), version), []):
            candidates.extend([(q / 'summary.json', 'backfill'), (q / 'champion/summary.json', 'backfill')])
        if r['benchmark'] == 'alfworld':
            candidates.append((D / 'alfworld-checkpoints-20261023' / (base.name + '-' + version) / 'champion/summary.json', 'backfill'))
        if version == final and r.get('final_test') and r['final_test'].get('valid_episodes') == expected and r['final_test'].get('missing_episodes') == 0:
            p['test_measurement'] = {**r['final_test'], 'complete': True, 'kind': 'final_selected'}
        else:
            for path, origin in candidates:
                s = summary(path, r['benchmark'], expected)
                if s:
                    p['test_measurement'] = {**s, 'kind': 'final_selected' if version == final else 'retrospective_checkpoint', 'origin': origin}
                    break
        if version == final and p.get('test_measurement'):
            r['final_test'] = p['test_measurement']
        if p.get('adopted'):
            if p.get('test_measurement'):
                tested += 1
            else:
                source = base / 'runs/frozen' / version
                kind = 'native'
                if r['benchmark'] == 'telecom' and (base / 'runs' / version / 'composition.json').exists():
                    source = base / 'runs' / version
                    kind = 'tau'
                elif ident.startswith('alfworld-official50-20r-20261022/'):
                    kind = 'alfworld'
                queue.append({'id': ident.replace('/', '--') + '--' + version,
                              'group_id': ident, 'group_root': str(base), 'domain': r['benchmark'],
                              'version': version, 'parent': p.get('parent'), 'expected': expected,
                              'source': str(source), 'kind': kind,
                              'artifact_available': (source / 'composition.json').exists(),
                              'training_finished': bool(r.get('final_selection')),
                              'defer_until_final': ident.startswith('l4-fixed100-sol61-high-20261102/'),
                              'priority': 0 if r.get('method_id') in ['L4', 'L5', 'L4_seeded', 'resume'] else 1,
                              'reuse': str(native_eval / version / 'test'),
                              'test_feedback_to_optimizer': False})
    r['test_coverage'] = {'promoted': r['adopted_candidates'], 'tested_promoted': tested, 'missing_promoted': r['adopted_candidates'] - tested}
    u = usage(base, cfg, all_points)
    r['token_accounting'] = u
    r['efficiency']['optimizer_tokens'] = (u['optimizer'] or {}).get('total_tokens')
    r['efficiency']['learning_tokens'] = (u['learning'] or {}).get('total_tokens')
    if u['optimizer']:
        r['evidence_gaps'] = [e for e in r['evidence_gaps'] if 'token' not in e.lower()]
    groups.append(r)
    print('GROUP', len(groups), ident, r['decisions_completed'], r['test_coverage'], flush=True)

now = datetime.now(timezone.utc).isoformat()
save(OUT / 'runs.json', {'schema_version': 2, 'collected_at': now, 'run_count': len(groups), 'runs': groups})
from highpoint_policy import choose
choose(groups, queue)
save(OUT / 'checkpoint-test-queue.json', {'collected_at': now,
      'policy': 'All missing promoted checkpoints; historical completed searches first. Active searches wait until training and their final test finish. No test feedback to optimizers.',
      'counts': dict(Counter(j['domain'] for j in queue)),
      'jobs': [{**{k: v for k, v in j.items() if k not in ['group_root', 'source', 'reuse']}, 'admitted_highpoint': j['priority'] <= 0} for j in queue]})
state = read(D / 'promoted-checkpoint-tests-20261102/state.json')
if state:
    public_queue = read(OUT / 'checkpoint-test-queue.json')
    public_queue['execution'] = {k: state.get(k) for k in ['updated_at', 'counts', 'done_test_episodes', 'planned_test_episodes']}
    counts = dict(Counter('not_selected_for_backfill' if x.get('priority', 1) > 0 and x['state'] != 'complete' else x['state'] for x in state.get('jobs', [])))
    if 'awaiting_scope' in counts: counts['not_selected_for_backfill'] = counts.get('not_selected_for_backfill', 0) + counts.pop('awaiting_scope')
    public_queue['execution']['counts'] = counts
    public_queue['execution']['planned_highpoint_episodes'] = sum(x['expected'] for x in state.get('jobs', []) if x.get('priority', 1) <= 0)
    public_queue['execution']['completed_highpoint_episodes'] = sum(x['expected'] for x in state.get('jobs', []) if x.get('priority', 1) <= 0 and x['state'] == 'complete')
    public_queue['policy'] = 'High points only, as confirmed by user. Promoted development high points in near-reference groups. Low points stay unmeasured, not scheduled. Current L4 reproduction groups wait for final selection and screening. No test feedback to optimizers.'
    save(OUT / 'checkpoint-test-queue.json', public_queue)
save(OUT / 'collection.json', {'collected_at': now, 'groups': len(groups), 'errors': errors,
      'missing_promoted': len(queue), 'missing_by_benchmark': dict(Counter(j['domain'] for j in queue)),
      'token_groups': sum(bool(r['token_accounting']['optimizer']) for r in groups)})
print('SUMMARY', json.dumps(read(OUT / 'collection.json'), ensure_ascii=False), flush=True)
