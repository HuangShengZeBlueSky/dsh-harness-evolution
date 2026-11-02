"""One publication view: benchmark waterlines, measured curves, costs and artifacts."""
from pathlib import Path
from datetime import datetime, timezone
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

NAMES = {'alfworld': 'ALFWorld', 'dbbench': 'DBBench', 'webshop': 'WebShop', 'osbench': 'OSBench', 'telecom': 'Telecom'}

def read(p):
    return json.loads(p.read_text())

def build(root):
    raw = read(root / 'results/research/runs.json')
    hist = read(root / 'results/research/historical-curves.json')
    methods = read(root / 'results/research-methods.json')['methods']
    hmap = {g['id']: g for g in hist['groups']}
    groups = []
    for r in raw['runs']:
        old = hmap.pop(r['id'], {})
        optimizer = r.get('optimizer') or {}
        if isinstance(optimizer, str):
            optimizer = {'model': optimizer}
        pts = []
        oldpoints = {p['version']: p for p in old.get('points', [])}
        for p in r['curve']:
            t = p.get('test_measurement') or {}
            if r['benchmark']=='webshop' and t.get('origin')=='backfill' and (root/'results/research/webshop-environment-status.json').exists():
                t = {}
            legacy = oldpoints.get(p['version'], {})
            if not t and legacy.get('independent_test'):
                z = legacy['independent_test']
                val = z.get('strict_test') if r['benchmark'] == 'webshop' else z.get('test')
                if val is not None:
                    t = {'strict_pass_at_1': val, 'kind': 'retrospective_checkpoint', 'complete': True}
            kept=(p.get('training') if p.get('adopted') else p.get('parent_training')) or {}
            pts.append({'round': p['round'], 'version': p['version'], 'parent': p.get('parent'),
                        'adopted': p.get('adopted'), 'train': kept.get('mean'),
                        'candidate_train': (p.get('training') or {}).get('mean'),
                        'train_strict': p.get('training_strict') if p.get('adopted') else kept.get('strict_pass_at_1'),
                        'reward': (p.get('training') or {}).get('mean'),
                        'validation': p.get('validation_strict') if p.get('validation_strict') is not None else p.get('validation'),
                        'batch': p.get('batch'), 'test': t.get('strict_pass_at_1'),
                        'test_kind': t.get('kind'), 'test_valid': t.get('valid_episodes'),
                        'test_expected': t.get('expected_episodes'),
                        'any3': t.get('observed_any_success_3'), 'all3': t.get('observed_all_success_3'),
                        'test_std': t.get('strict_repeat_population_std'),
                        'optimizer_tokens': (p.get('optimizer_usage_at_decision') or {}).get('total_tokens'),
                        'repairs': (p.get('paired') or {}).get('repaired'), 'regressions': (p.get('paired') or {}).get('regressed')})
        if oldpoints.get('baseline'):
            p = oldpoints['baseline']
            pts.insert(0, {'round': 0, 'version': 'baseline', 'train': p.get('after'), 'test': None, 'optimizer_tokens': 0})
        if r.get('baseline_test'):
            basepoint = next((p for p in pts if p['version'] == 'baseline'), None)
            if basepoint is None:
                basepoint = {'round': 0, 'version': 'baseline', 'optimizer_tokens': 0}
                pts.insert(0, basepoint)
            basepoint['test'] = r['baseline_test'].get('strict_pass_at_1')
            basepoint['test_kind'] = 'measured_startpoint'
        fin = r.get('final_selection') or {}
        ft = r.get('final_test') or {}
        opt = (r.get('token_accounting') or {}).get('optimizer')
        g = {'id': r['id'], 'benchmark': r['benchmark'], 'method': r['method_id'],
             'model': optimizer.get('model'), 'effort': optimizer.get('effort'),
             'start': r.get('startpoint'), 'collection': r['collection'],
             'rounds': r['decisions_completed'], 'budget': r.get('candidate_budget'),
             'adopted': r['adopted_candidates'], 'best': fin.get('best') or r.get('current_champion'),
             'complete': bool(fin), 'final_test': ft.get('strict_pass_at_1'),
             'any3': ft.get('observed_any_success_3'), 'all3': ft.get('observed_all_success_3'),
             'std': ft.get('strict_repeat_population_std'),
             'test_valid': ft.get('valid_episodes'), 'test_expected': ft.get('expected_episodes'),
             'actor': r.get('actor'), 'simulator': r.get('user_simulator'),
             'splits': r.get('split_counts'), 'selection': r.get('selection_rule'),
             'protocol': r.get('protocol'), 'coverage': r.get('test_coverage'),
             'checkpoint_test_protocol': r.get('checkpoint_test_protocol'),
             'tokens': opt, 'token_sources': (r.get('token_accounting') or {}).get('sources'),
             'learning_tokens': r.get('efficiency', {}).get('learning_tokens'),
             'hours': (r.get('efficiency', {}).get('first_to_last_decision_seconds') or 0) / 3600,
             'configuration_file': 'results/research/' + r['configuration_file'],
             'task_manifest_file': 'results/research/' + r['task_manifest_file'],
             'state': r.get('state', {}).get('phase'), 'points': pts}
        groups.append(g)
    for h in hmap.values():
        if h.get('stage_archive'):
            continue
        pts = []
        for p in h.get('points', []):
            v = p.get('strict_test') if h['benchmark'] == 'webshop' else p.get('test')
            if p.get('independent_test'):
                v = p['independent_test'].get('strict_test') if h['benchmark'] == 'webshop' else p['independent_test'].get('test')
            pts.append({'round': p.get('round', 0), 'version': p.get('version'), 'parent': p.get('parent'),
                        'adopted': p.get('adopted'), 'train': p.get('after'), 'validation': p.get('validation'),
                        'batch': p.get('batch'), 'test': v, 'test_kind': 'historical_measurement', 'optimizer_tokens': None})
        groups.append({'id': h['id'], 'benchmark': h['benchmark'], 'method': h.get('method_id') or h.get('family') or h.get('method'),
                       'method_label': h.get('method'), 'model': h.get('model'), 'start': h.get('start'),
                       'collection': 'historical', 'rounds': h.get('rounds'), 'budget': h.get('budget'),
                       'best': h.get('best'), 'complete': h.get('complete'),
                       'final_test': h.get('strict_test') if h['benchmark'] == 'webshop' else h.get('test'),
                       'points': pts, 'tokens': None})
    board = read(root / 'results/leaderboard.json')
    queue = read(root / 'results/research/checkpoint-test-queue.json')
    artifacts = read(root / 'results/research/published-artifact-summary.json')['selected_checkpoints']
    for b, a in artifacts.items():
        match = next((g for g in groups if g['id'] == a['source_experiment']), None)
        if match:
            a['optimizer_usage'] = match.get('tokens')
            a['rounds'] = match.get('rounds')
    data = {'updated_at': raw['collected_at'], 'groups': groups, 'methods': methods,
            'artifacts': artifacts, 'board': board,
            'papers': read(root / 'results/paper-baselines.json'),
            'paper_evolution': read(root / 'results/research/paper-evolution.json'),
            'telecom_history': read(root / 'results/life-harness-telecom-history.json'),
            'local_references': read(root / 'results/local-references.json'), 'queue': queue}
    for key, filename in [('repeated_tests','repeated-tests.json'),('comparison_catalog','comparison-catalog.json')]:
        p=root/'results/research'/filename
        data[key]=read(p) if p.exists() else {}
    site = root / 'site'
    site.mkdir(exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    (site / 'index.html').write_text((root / 'tools/observatory-template.html').read_text().replace('__DATA__', payload))
    (site / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    (root / 'results/research/observatory.json').write_text(json.dumps({k: v for k, v in data.items() if k not in ['board', 'methods', 'local_references']}, ensure_ascii=False, indent=2) + '\n')
    plots(root, data)
    print('Observatory:', len(groups), 'curves;', sum(bool(g.get('tokens')) for g in groups), 'usage totals')
    return data

def plots(root, data):
    dest = root / 'assets/evolution'
    dest.mkdir(exist_ok=True)
    palette = ['#1c7d79', '#e09847', '#5d6ac9', '#d36573', '#78a87b']
    for b in NAMES:
        fig, (ax, bx) = plt.subplots(1, 2, figsize=(11.6, 4.2), gridspec_kw={'width_ratios': [1.7, 1]})
        fig.patch.set_facecolor('#fbfaf7')
        native = [g for g in data['groups'] if g['benchmark'] == b and g.get('method') in ['L4', 'L5', 'L4_simple', 'L4_fixed100'] and 'sol61' in g['id'] and 'medium' not in g['id']]
        if b in ['alfworld', 'telecom']:
            native = [g for g in data['groups'] if g['id'] == data['artifacts'][b]['source_experiment']] + [g for g in native if g['collection'] != 'historical']
        seen = set()
        for i, g in enumerate(native[:5]):
            if g['id'] in seen:
                continue
            seen.add(g['id'])
            ps = [p for p in g['points'] if p.get('test') is not None]
            color = palette[i % len(palette)]
            ax.plot([p['round'] for p in ps], [p['test'] * 100 for p in ps], marker='o', ms=4.5, lw=1.8, color=color, label=str(g['method']))
            if g.get('final_test') is not None:
                p = next((p for p in g['points'] if p['version'] == g.get('best')), None)
                if p:
                    ax.scatter([p['round']], [g['final_test'] * 100], marker='D', s=55, color=color, edgecolors='white', zorder=5)
        refs = [m for m in data['papers']['methods'] if m['id'] != 'bare' and m['pass_at_1'].get(b) is not None]
        line = max(refs, key=lambda m: m['pass_at_1'][b])
        ax.axhline(line['pass_at_1'][b] * 100, ls='--', lw=1.2, color='#b26d37', label='Paper reference: ' + line['label'].split(' / ')[0])
        ax.set(xlabel='Candidate round', ylabel='Measured test success (%)', title=NAMES[b] + ' | measured checkpoints')
        handles, labels = ax.get_legend_handles_labels()
        ax.legend(handles, labels, frameon=False, fontsize=7, loc='best')
        model_runs = [g for g in data['groups'] if g['benchmark'] == b and g['collection'] == 'fixed100_simple' and g.get('effort') == 'high' and g.get('final_test') is not None]
        labels = [str(g['model']).replace('gpt-', '').replace('-sol', '').replace('-luna', 'Luna').replace('6.1-terra', 'Terra 6.1') for g in model_runs]
        bx.barh(labels, [g['final_test'] * 100 for g in model_runs], color=palette[:len(model_runs)])
        bx.set(xlabel='Final test success (%)', title='Fixed100 / 40 rounds / high')
        if not model_runs:
            bx.text(.5, .5, 'Final comparison pending', ha='center', va='center', transform=bx.transAxes, color='#7c8491')
        for a in [ax, bx]:
            a.set_facecolor('#fbfaf7')
            a.spines[['top', 'right']].set_visible(False)
            a.grid(axis='y', alpha=.12)
        fig.text(.01, .015, 'Dots: actual tests only. Diamonds: selected finals. Reference protocols differ; Telecom uses a different user simulator.', fontsize=7, color='#69717d')
        fig.tight_layout(rect=[0, .05, 1, 1])
        for ext in ['png', 'svg']:
            fig.savefig(dest / f'{b}.{ext}', dpi=180, facecolor=fig.get_facecolor())
        plt.close(fig)

if __name__ == '__main__':
    build(Path(__file__).resolve().parents[1])
