"""Publish the official arXiv BibTeX export from website/paper.bib when available."""
import html
import re
import sys
from pathlib import Path


def render(directory):
    paper = directory / "paper.bib"
    if not paper.exists():
        return
    bibtex = paper.read_text(encoding="utf-8").strip()
    match = re.search(r'\beprint\s*=\s*[{"](\d{4}\.\d{4,5}(?:v\d+)?)[}"]', bibtex, re.I)
    if not match:
        raise ValueError("paper.bib must contain the eprint field from the arXiv export")
    url = f"https://arxiv.org/abs/{match[1]}"
    paper_link = f'<a href="{url}">Paper on arXiv ↗</a>'
    section = f"""<p class="intro">Cite the HookEvo paper using the arXiv record. The code and benchmark artifacts have a separate software citation.</p>
<pre><code id="bibtex">{html.escape(bibtex)}</code></pre>
<div class="actions"><button type="button" id="copy-citation" hidden>Copy BibTeX</button><a href="paper.bib" download>Download .bib</a>{paper_link}<a href="https://github.com/HuangShengZeBlueSky/HookEvo/blob/main/CITATION.cff">Software citation ↗</a></div>"""
    index = directory / "index.html"
    page = index.read_text(encoding="utf-8")
    before, rest = page.split("<!-- citation:start -->")
    _, after = rest.split("<!-- citation:end -->")
    index.write_text((before + section + after).replace("<!-- paper-link -->", paper_link), encoding="utf-8")


if __name__ == "__main__":
    render(Path(sys.argv[1]))
