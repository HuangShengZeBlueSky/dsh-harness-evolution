const copyCitation = document.getElementById('copy-citation');
if (navigator.clipboard) {
  copyCitation.hidden = false;
  copyCitation.addEventListener('click', async () => {
    const status = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(document.getElementById('bibtex').textContent.trim());
      status.textContent = 'BibTeX copied.';
    } catch {
      status.textContent = 'Select the reference to copy it, or download the .bib file.';
    }
  });
}
