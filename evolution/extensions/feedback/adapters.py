"""Host adapters yield observations; the analysis core never selects candidates."""
import json
from pathlib import Path


def native_files(group):
    root = Path(group['path']) / 'runs/evaluations'
    for path in root.glob('*/*/**/episodes.jsonl'):
        relative = path.relative_to(root).parts
        yield path, relative[0], relative[1], next((x for x in relative if x.startswith('batch-')), '')


def native_observations(path):
    with path.open('rb') as handle:
        while True:
            offset = handle.tell()
            line = handle.readline()
            if not line:
                break
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                # A running host may still be appending its last record.
                break
            yield offset, row


def telecom_files(group):
    root = Path(group['path'])
    versions = group.get('version_paths')
    entries = [(v, Path(p)) for v, p in versions.items()] if versions else [(p.name, p) for p in [root / 'baseline', *(root / 'runs').glob('v[0-9][0-9]')]]
    for version, base in entries:
        for split in ['train', 'test', 'validation']:
            for path in (base / split).glob('trial-*/*--t*.json'):
                yield path, version, split, ''


def telecom_observations(path):
    raw = json.loads(path.read_text())
    allowed = {'user_stop', 'agent_stop', 'max_steps', 'too_many_errors', 'timeout'}
    messages = []
    for m in raw.get('messages', []):
        if m.get('role') not in ['user', 'assistant', 'tool', 'system']:
            continue
        if m.get('role') == 'tool' and m.get('requestor') not in ['assistant', None]:
            continue
        messages.append({k: m[k] for k in ['role', 'content', 'tool_calls', 'tool_call_id', 'error'] if k in m})
    valid = raw.get('reward_info') is not None and raw.get('termination_reason') in allowed
    yield 0, {'task_id': raw['task_id'], 'trial': raw['trial'], 'seed': raw['seed'], 'valid': valid,
              'score': raw['reward_info']['reward'] if valid else None, 'messages': messages,
              'termination_reason': raw.get('termination_reason'), 'elapsed_seconds': raw.get('duration')}


ADAPTERS = {'native': (native_files, native_observations), 'telecom': (telecom_files, telecom_observations)}
