"""Select promoted development high points; never substitute train for test."""
from collections import defaultdict

PAPER = {'alfworld': .89, 'dbbench': .65, 'webshop': .455, 'osbench': .396}
MARGIN = {'alfworld': .05, 'dbbench': .05, 'webshop': .05, 'osbench': .10, 'telecom': .05}

def choose(groups, jobs):
    bygroup = defaultdict(list)
    for j in jobs:
        j['priority'] = 1
        j['screening'] = {'selected': False, 'reason': 'Not a selected development high point'}
        bygroup[j['group_id']].append(j)
    summaries = []
    for g in groups:
        pending = bygroup.get(g['id'], [])
        if not pending:
            continue
        b = g['benchmark']
        # Telecom has a GLM user: use the released same-family local target,
        # never equate it with the paper's different-simulator 90/95 scores.
        target = PAPER.get(b, .8416666666666667)
        anchor = (g.get('final_test') or {}).get('strict_pass_at_1')
        live_repro = g['id'].startswith('l4-fixed100-sol61-high-20261102/')
        if anchor is None and not live_repro:
            continue
        if anchor is not None and anchor < target - MARGIN[b]:
            continue
        points = [p for p in g['curve'] if p.get('adopted')]
        def val(p):
            v = p.get('validation_strict')
            if v is None:
                v = p.get('validation')
            return v.get('mean') if isinstance(v, dict) else v
        use_val = any(isinstance(val(p), (int, float)) for p in points)
        def metric(p):
            if use_val:
                return val(p)
            return p.get('training_strict') if p.get('training_strict') is not None else (p.get('training') or {}).get('mean')
        best_by_batch = {}
        for p in points:
            v = metric(p)
            if not isinstance(v, (int, float)):
                continue
            key = 'validation' if use_val else str(p.get('batch') or 'fixed')
            best_by_batch[key] = max(best_by_batch.get(key, v), v)
        indexed = {p['version']: p for p in points}
        ranked = []
        for j in pending:
            p = indexed.get(j['version'], {})
            v = metric(p)
            key = 'validation' if use_val else str(p.get('batch') or 'fixed')
            if not isinstance(v, (int, float)) or key not in best_by_batch:
                continue
            gap = best_by_batch[key] - v
            if gap <= .05 + 1e-9:
                ranked.append((gap, -p['round'], j, key))
        for gap, _, j, key in sorted(ranked, key=lambda x: (x[0], x[1])):
            j['priority'] = 0
            j['screened_after_final'] = anchor is not None
            j['screening'] = {'selected': True, 'basis': key, 'development_gap': gap,
                              'group_final_test': anchor, 'reference_target': target,
                              'reference_margin': MARGIN[b],
                              'reason': 'Within five pp of the same-group validation or same-batch development high. Group test anchor must be near reference; live L4 reproduction waits for final screening.'}
        summaries.append({'group_id': g['id'], 'anchor_test': anchor, 'selected': sum(j['priority'] == 0 for j in pending)})
    return summaries
