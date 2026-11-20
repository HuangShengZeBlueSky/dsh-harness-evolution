const hooks = [
  ['Receipt', 'A successful pickup updates the object held in episode state.',
    'if (take) { held = take[1]; known.delete(held); }'],
  ['Context', 'During prompt assembly, guidance includes the held object and a recommended next action.',
    "const text = guidance(); audit({method_id:name,hook:'system-prompt/assemble',text});"],
  ['Action', 'Before a tool call, the guard checks whether the agent skipped an available pickup.',
    "const skippedPickup = !held && recovery?.startsWith('take ' + target + ' ') && action !== recovery;"]
];
const selector = document.querySelector('.hook-select');
for (const [index, [label, copy, code]] of hooks.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.setAttribute('aria-pressed', String(index === 0));
  button.onclick = () => {
    for (const item of selector.children) item.setAttribute('aria-pressed', String(item === button));
    document.getElementById('instrument').dataset.stage = String(index);
    document.getElementById('hook-copy').textContent = copy;
    document.getElementById('hook-code').textContent = code;
  };
  selector.append(button);
}
selector.hidden = false;
