// Keep the full paper table readable when scripts are disabled.
const leaderboard = document.getElementById('main-board');
const headings = Array.from(leaderboard.tHead.rows[0].cells);
const body = leaderboard.tBodies[0];
const paperOrder = Array.from(body.rows);
for (const [index, heading] of headings.entries()) {
  if (index === 0 || index === headings.length - 1) continue;
  const button = document.createElement('button');
  const label = heading.textContent;
  button.textContent = label;
  button.title = 'Sort by ' + label + ' success rate';
  heading.replaceChildren(button);
  button.addEventListener('click', () => {
    const descending = heading.getAttribute('aria-sort') !== 'descending';
    for (const cell of headings) cell.removeAttribute('aria-sort');
    heading.setAttribute('aria-sort', descending ? 'descending' : 'ascending');
    const score = row => Number.parseFloat(row.cells[index].textContent);
    const sorted = paperOrder.slice().sort((a, b) => {
      const left = score(a), right = score(b);
      if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1;
      if (Number.isNaN(right)) return -1;
      return descending ? right - left : left - right;
    });
    body.append(...sorted);
  });
}
