"""Native-host boundary adapter: allowed TRAIN data in, optional feedback out."""
import difflib
import json
import random
import time
from pathlib import Path
import yaml
from study_inventory import ROOT, read, write, native_rows
from adapters import telecom_observations
from semantic_worker import execute


def candidate(base, version, telecom):
    return base / 'baseline' if version == 'baseline' else base / ('runs' if telecom else 'candidates') / version


def training_rows(base, cfg, parent, version, telecom):
    if telecom:
        return [next(telecom_observations(p))[1] for p in sorted((candidate(base, parent, True) / 'train').glob('trial-*/*--t*.json'))]
    batches = cfg['benchmark'].get('train_batches', [])
    batch = (int(version[1:]) - 1) % len(batches) + 1 if batches else None
    folder = base / 'runs/evaluations' / parent / 'train'
    if batch:
        folder /= f'batch-{batch:02d}'
    return list(native_rows(folder / 'episodes.jsonl').values())


def boundary(base, version, phase):
    cfg = yaml.safe_load((base / 'experiment.yaml').read_text())
    telecom = cfg.get('engine') == 'telecom'
    folder = candidate(base, version, telecom)
    parent = read(folder / 'composition.json').get('parent') if telecom else read(folder / 'parent.json')['parent']
    arm = cfg['frontier']['feedback']
    ident = cfg['name']
    evidence_root = ROOT / 'analysis/online' / ident / version
    result_path = evidence_root / (phase + '-result.json')
    if read(result_path, {}).get('status') == 'complete':
        return
    rows = [r for r in training_rows(base, cfg, parent, version, telecom) if r.get('valid') is True]
    protocol = read(ROOT / 'analysis_protocol.json')
    observations = []; mapping = []
    for success, count in [(False, 8), (True, 4)]:
        population = [r for r in rows if (r['score'] >= 1) == success]
        chosen = random.Random('20261029:' + version + ':' + str(success)).sample(population, min(count, len(population)))
        for row in chosen:
            name = f'P{len(observations) + 1:03d}'
            observations.append({'observation_id': name, 'domain': cfg.get('domain', 'ALFWorld'), 'native_success': success,
                                 'visible_messages': [{'message_index': i, **{k: m[k] for k in ['role', 'content', 'tool_calls', 'tool_call_id'] if k in m}} for i, m in enumerate(row['messages'])]})
            mapping.append({'observation_id': name, 'task_id': row['task_id'], 'trial': row['trial'], 'seed': row['seed'], 'parent_success': success,
                            'sampling_probability': len(chosen) / len(population), 'population': len(population)})
    payload = {'mode': 'prospective_prediction' if phase == 'prediction' else arm + '_feedback',
               'taxonomy': protocol['labels'], 'Q_fields': protocol['Q_fields'], 'observations': observations,
               'shared_feedback_character_budget': 16000}
    if phase == 'prediction':
        proposal = read(folder / 'analysis.json', {})
        old_folder = candidate(base, parent, telecom)
        changes = []
        old = {str(p.relative_to(old_folder)): p for p in (old_folder / 'plugins').rglob('*.mjs')}
        new = {str(p.relative_to(folder)): p for p in (folder / 'plugins').rglob('*.mjs')}
        for name in sorted(set(old) | set(new)):
            before = old[name].read_text().splitlines() if name in old else []
            after = new[name].read_text().splitlines() if name in new else []
            changes.extend(difflib.unified_diff(before, after, fromfile='parent/' + name, tofile='proposal/' + name))
        payload['proposal'] = proposal
        payload['code_changes'] = '\n'.join(changes)
        payload['feedback_condition'] = arm
    packet = evidence_root / (phase + '-packet.json')
    write(packet, payload)
    write(evidence_root / (phase + '-mapping.json'), {'parent': parent, 'candidate': version, 'phase': phase, 'created_before_candidate_execution': phase == 'prediction', 'samples': mapping})
    # All packets get distinct sandbox names, even across native groups.
    isolated_packet = ROOT / 'analysis/online-packets' / f'{ident}-{version}-{phase}.json'
    write(isolated_packet, payload)
    result = execute(isolated_packet)
    if result['status'] not in ['complete', 'existing']:
        raise RuntimeError('Luna high failed; preserve native candidate and retry only analysis')
    data = read(Path(result['answer']))
    write(result_path, {**result, 'status': 'complete', 'finished_at': time.time(), 'output': data})
    if phase == 'feedback':
        lookup = {m['observation_id']: m['task_id'] for m in mapping}
        full = json.dumps(data, ensure_ascii=False)
        visible = data if len(full) <= 16000 else {'feedback': full[:16000], 'truncated_to_shared_budget': True}
        write(folder / 'diagnostic-feedback.json', {'condition': arm, 'feedback': visible, 'feedback_character_budget': 16000, 'uncapped_response_characters': len(full), 'current_training_task_mapping': lookup, 'interpretation': 'Auxiliary analyst advice, not validated cause; native host owns scoring and adoption. Raw analyst response and usage retained separately; completed historical feedback is not rewritten.'})
    print(f'{phase} frozen for {version}; {len(observations)} current TRAIN observations only.', flush=True)


def main():
    import sys
    base = Path.cwd()
    from scope import authorized
    if not authorized(base):
        raise SystemExit('Current user scope permits only the ten existing feedback arms.')
    args = sys.argv[1:]
    phase = args[0]
    version = args[1] if len(args) > 1 else None
    split = args[args.index('--split') + 1] if '--split' in args else 'development'
    before = phase == 'evaluate' and version != 'baseline' and split != 'test'
    if before:
        boundary(base, version, 'prediction')
        cfg = yaml.safe_load((base / 'experiment.yaml').read_text())
        write(ROOT / 'analysis/online' / cfg['name'] / version / 'native-dispatch.json', {'candidate': version, 'time': time.time(), 'action': args, 'dependency': 'prediction-result.json completed before native subprocess dispatch'})
    import subprocess
    result = subprocess.run([sys.executable, str(base / 'native_experiment.py'), *args])
    if result.returncode:
        raise SystemExit(result.returncode)
    if phase == 'prepare':
        boundary(base, version, 'feedback')


if __name__ == '__main__':
    main()
