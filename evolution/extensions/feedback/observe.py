"""Incremental, script-only full-population observation and paired accounting."""
import json
import re
import sqlite3
import time
from collections import Counter
from pathlib import Path
from adapters import ADAPTERS
from study_inventory import ROOT, read, write


def connect():
    folder = ROOT / 'analysis'
    folder.mkdir(exist_ok=True)
    db = sqlite3.connect(folder / 'observations.sqlite', timeout=120)
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS metadata(name TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE IF NOT EXISTS sources(path TEXT PRIMARY KEY, mtime INTEGER, size INTEGER);
    CREATE TABLE IF NOT EXISTS observations(
      group_id TEXT, benchmark TEXT, method TEXT, version TEXT, split TEXT, batch TEXT,
      task_id TEXT, trial INTEGER, seed INTEGER, valid INTEGER, score REAL, success INTEGER,
      termination TEXT, elapsed REAL, model_calls INTEGER, input_tokens INTEGER,
      output_tokens INTEGER, tool_calls INTEGER, tool_errors INTEGER, actions TEXT,
      phases TEXT, source TEXT, byte_offset INTEGER,
      PRIMARY KEY(group_id, version, split, batch, task_id, trial, seed));
    CREATE TABLE IF NOT EXISTS decisions(group_id TEXT, version TEXT, parent TEXT,
      adopted INTEGER, reason TEXT, source TEXT, PRIMARY KEY(group_id,version));
    ''')
    revision = db.execute("SELECT value FROM metadata WHERE name='observation_revision'").fetchone()
    if revision != ('2',):
        db.execute('DELETE FROM sources')
        db.execute("INSERT OR REPLACE INTO metadata VALUES('observation_revision','2')")
        db.commit()
    return db


def metrics(row, patterns):
    executions = [e for e in row.get('executions', []) if e.get('effective') is True and e.get('decision') == 'execute']
    execution_observable = 'executions' in row
    if execution_observable:
        actions = [{'name': e.get('name'), 'args': e.get('args'), 'effective': e.get('effective'), 'error': e.get('error')} for e in executions]
    else:
        receipts = {m.get('tool_call_id') for m in row.get('messages', []) if m.get('role') == 'tool'}
        actions = [{'name': c.get('function', {}).get('name'), 'args': c.get('function', {}).get('arguments')} for m in row.get('messages', []) if m.get('role') == 'assistant' for c in m.get('tool_calls') or [] if c.get('id') in receipts]
    phases = {}
    for phase, pattern in patterns.items():
        reached = [i for i, a in enumerate(actions) if re.search(pattern, json.dumps(a, ensure_ascii=False), re.I)]
        phases[phase] = {'observed': bool(reached), 'first_action': reached[0] if reached else None,
                         'observation_basis': 'runner_execution' if execution_observable else 'actor_call_with_tool_receipt',
                         'observed_errors': sum(bool(actions[i].get('error')) for i in reached) if execution_observable else None,
                         'downstream_task_failed': row.get('score', 0) < 1 if row.get('valid') and reached else None}
    requests = row.get('requests', [])
    input_tokens = sum(q.get('input_tokens', 0) or 0 for q in requests) if requests else None
    usages = [q.get('usage') or q.get('response', {}).get('usage') for q in requests]
    output_tokens = sum(u.get('completion_tokens', 0) for u in usages if u) if any(usages) else None
    errors = sum(bool(e.get('error')) for e in executions) if execution_observable else None
    return actions, phases, len(requests) if requests else None, input_tokens, output_tokens, errors


def ingest():
    db = connect()
    protocol = read(ROOT / 'analysis_protocol.json')
    from scope import observation_groups
    groups = observation_groups()
    counts = Counter()
    for group in groups:
        files, observations = ADAPTERS[group['adapter']]
        patterns = protocol['domains'][group['benchmark']]
        for path, version, split, batch in files(group):
            stat = path.stat()
            previous = db.execute('SELECT mtime,size FROM sources WHERE path=?', (str(path),)).fetchone()
            if previous == (stat.st_mtime_ns, stat.st_size):
                continue
            for offset, row in observations(path):
                actions, phases, calls, inputs, outputs, errors = metrics(row, patterns)
                values = (group['id'], group['benchmark'], group['method'], version, split, batch,
                          str(row['task_id']), row['trial'], row['seed'], int(row.get('valid') is True), row.get('score'),
                          int(row['score'] >= 1) if row.get('valid') else None, row.get('termination_reason'),
                          row.get('elapsed_seconds'), calls, inputs, outputs, len(actions), errors,
                          json.dumps(actions, ensure_ascii=False), json.dumps(phases), str(path), offset)
                db.execute('INSERT OR REPLACE INTO observations VALUES (' + ','.join('?' * len(values)) + ')', values)
                counts[group['id']] += 1
            db.execute('INSERT OR REPLACE INTO sources VALUES(?,?,?)', (str(path), stat.st_mtime_ns, stat.st_size))
            db.commit()
        for path in (Path(group['path']) / 'runs/decisions').glob('v*.json'):
            d = read(path)
            db.execute('INSERT OR REPLACE INTO decisions VALUES(?,?,?,?,?,?)', (group['id'], d.get('candidate', path.stem), d['parent'], d.get('adopted'), d.get('reason'), str(path)))
        db.commit()
        write(ROOT / 'control/observer-state.json', {'status': 'ingesting', 'current_group': group['id'], 'rows_processed_this_pass': dict(counts), 'updated_at': time.time()})
    summarize(db)
    write(ROOT / 'control/observer-state.json', {'status': 'complete_pass', 'rows_processed_this_pass': dict(counts), 'updated_at': time.time()})
    print(json.dumps({'ingested': dict(counts), 'total_observations': db.execute('SELECT COUNT(*) FROM observations').fetchone()[0]}), flush=True)


def summarize(db):
    db.row_factory = sqlite3.Row
    import yaml
    native_batches = {}
    from scope import observation_groups
    allowed = observation_groups()
    allowed_ids = {g['id'] for g in allowed}
    for group in allowed:
        cfg_path = Path(group['path']) / 'experiment.yaml'
        cfg = yaml.safe_load(cfg_path.read_text()) if cfg_path.exists() else {}
        native_batches[group['id']] = len(cfg.get('benchmark', {}).get('train_batches', []))
    curves = []
    for d in db.execute('SELECT * FROM decisions ORDER BY group_id,version').fetchall():
        if d['group_id'] not in allowed_ids:
            continue
        count = native_batches[d['group_id']]
        batch = f'batch-{(int(d["version"][1:]) - 1) % count + 1:02d}' if count else ''
        pairs = db.execute('''SELECT a.success AS after,b.success AS before,a.actions != b.actions AS changed
          FROM observations a JOIN observations b ON a.group_id=b.group_id AND a.task_id=b.task_id
          AND a.trial=b.trial AND a.seed=b.seed AND a.batch=b.batch AND a.split=b.split
          WHERE a.group_id=? AND a.version=? AND b.version=? AND a.split='train' AND a.batch=? AND a.valid=1 AND b.valid=1''', (d['group_id'], d['version'], d['parent'], batch)).fetchall()
        n = len(pairs)
        curves.append({**dict(d), 'native_batch': batch, 'paired_episodes': n, 'parent_strict_success': sum(r['before'] for r in pairs) / n if n else None,
                       'candidate_strict_success': sum(r['after'] for r in pairs) / n if n else None,
                       'Q_to_S': sum(not r['before'] and r['after'] for r in pairs), 'S_to_Q': sum(r['before'] and not r['after'] for r in pairs),
                       'persistent_failure': sum(not r['before'] and not r['after'] for r in pairs), 'behavior_changed': sum(r['changed'] for r in pairs)})
    exposure = []
    for row in db.execute('SELECT group_id,version,split,valid,success,phases FROM observations'):
        if row['group_id'] not in allowed_ids:
            continue
        if not row['valid']:
            continue
        for phase, value in json.loads(row['phases']).items():
            exposure.append((row['group_id'], row['version'], row['split'], phase, value['observed'], not row['success'], value['observed_errors']))
    sums = {}
    for group, version, split, phase, observed, failed, errors in exposure:
        d = sums.setdefault((group, version, split, phase), {'episodes': 0, 'observed': 0, 'unobserved_unknown': 0, 'downstream_failed_when_observed': 0, 'runner_error_count': 0, 'runner_error_observable_episodes': 0})
        d['episodes'] += 1
        d['observed' if observed else 'unobserved_unknown'] += 1
        d['downstream_failed_when_observed'] += int(observed and failed)
        if errors is not None:
            d['runner_error_count'] += errors
            d['runner_error_observable_episodes'] += 1
    result = []
    for (group, version, split, phase), counts in sums.items():
        result.append({'group_id': group, 'version': version, 'split': split, 'phase': phase, **counts,
                       'reach_rate': counts['observed'] / counts['episodes'],
                       'task_failure_conditional_on_reach': counts['downstream_failed_when_observed'] / counts['observed'] if counts['observed'] else None,
                       'interpretation': 'Downstream task failure conditional on observed execution, not proven failure of this phase'})
    write(ROOT / 'analysis/native-curves.json', curves)
    write(ROOT / 'analysis/phase-exposure.json', result)
    write(ROOT / 'analysis/population.json', [dict(r) for r in db.execute('''SELECT group_id,version,split,COUNT(*) episodes,SUM(valid) valid,SUM(success) successes,AVG(CASE WHEN valid THEN score END) mean_score,SUM(elapsed) elapsed_seconds,SUM(model_calls) recorded_model_calls,SUM(input_tokens) recorded_input_tokens,SUM(output_tokens) recorded_output_tokens FROM observations GROUP BY group_id,version,split''') if r['group_id'] in allowed_ids])


if __name__ == '__main__':
    import fcntl
    with (ROOT / 'control/observer.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        ingest()
