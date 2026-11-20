const switcher = document.querySelector('.switcher');
const buttons = Array.from(switcher.querySelectorAll('button'));
function showCheckpoint(selected) {
  for (const button of buttons) {
    const active = button === selected;
    button.setAttribute('aria-pressed', String(active));
    document.getElementById(button.getAttribute('aria-controls')).hidden = !active;
  }
}
for (const button of buttons) {
  button.addEventListener('click', () => showCheckpoint(button));
}
showCheckpoint(buttons[0]);
switcher.hidden = false;
