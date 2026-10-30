"""The rewritten EXECUTE contract is authoritative; only ten feedback arms execute."""
from pathlib import Path
from study_inventory import ROOT, read

SCOPE = 'historical_plus_two_feedback_loops'
FEEDBACK_METHODS = {'dsh-summary', 'dsh-mechanism'}


def feedback_groups():
    return [{**g, 'path': str((ROOT / g['path']).resolve())} for g in read(ROOT / 'manifest.json')['groups'] if g.get('role') == 'feedback_comparison' and g['method'] in FEEDBACK_METHODS]


def history_groups():
    return [g for g in read(ROOT / 'manifest.json').get('history_groups', []) if g.get('adapter') in {'native', 'telecom'} and g.get('available', True)]


def observation_groups():
    return history_groups() + feedback_groups()


def authorized(base):
    return any(Path(g['path']).resolve() == Path(base).resolve() for g in feedback_groups())


def sampling_path():
    return ROOT / 'analysis/scoped-semantic-sampling.json'
