const el = id => document.getElementById(id);
let current;
function showCases() {
  const filter = el('filter').value;
  const rows = current.cases.filter(c => filter === 'all' ||
    (filter === 'changed' ? c.parent !== c.candidate : !c.candidate));
  el('cases').replaceChildren();
  for (const c of rows) {
    const row = el('cases').insertRow();
    for (const value of [c.task.replace(/^train\//, '') + ' · trial ' + c.trial,
      c.parent ? 'Success' : 'Failure', c.candidate ? 'Success' : 'Failure']) {
      row.insertCell().textContent = value;
    }
  }
  el('count').textContent = rows.length + ' of ' + current.cases.length + ' paired tasks';
}
function selectRound(record, button) {
  current = record;
  for (const b of el('rounds').children) b.setAttribute('aria-pressed', String(b === button));
  for (const key of ['title', 'observation', 'decision']) el(key).textContent = record[key];
  el('status').textContent = record.retained ? 'Candidate retained' : 'Parent retained';
  const cases = record.cases;
  const rate = key => (100 * cases.filter(c => c[key]).length / cases.length).toFixed(0) + '%';
  const metrics = [['Parent success', rate('parent')], ['Candidate success', rate('candidate')],
    ['Repairs', cases.filter(c => !c.parent && c.candidate).length],
    ['Regressions', cases.filter(c => c.parent && !c.candidate).length]];
  el('metrics').replaceChildren();
  for (const [label, value] of metrics) {
    const block = document.createElement('div');
    const number = document.createElement('b');
    number.textContent = value;
    block.append(number, label);
    el('metrics').append(block);
  }
  showCases();
}
async function loadReplay() {
  const response = await fetch('alfworld-rounds.json');
  if (!response.ok) throw Error('Missing replay data');
  const records = await response.json();
  for (const record of records) {
    const button = document.createElement('button');
    button.textContent = 'Round ' + record.round + ' · ' + (record.retained ? 'Accepted' : 'Rejected');
    button.onclick = () => selectRound(record, button);
    el('rounds').append(button);
  }
  el('filter').onchange = showCases;
  el('rounds').firstElementChild.click();
  el('record').hidden = false;
  el('notice').textContent = 'The replay includes paired task outcomes and recorded decision rationale. Full message transcripts and per-call traces are outside this release.';
}
loadReplay().catch(() => { el('notice').textContent = 'The recorded rounds could not be loaded. Open Replay data above to inspect the source.'; });
