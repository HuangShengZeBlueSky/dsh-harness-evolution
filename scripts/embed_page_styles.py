"""Ship each page with its own CSS so cached assets cannot restyle a new layout."""
from pathlib import Path
import sys


def embed_styles(site):
    link = '<link rel="stylesheet" href="style.css">'
    css = (site / "style.css").read_text(encoding="utf-8")
    for page in sorted(site.glob("*.html")):
        html = page.read_text(encoding="utf-8")
        if html.count(link) != 1:
            raise ValueError(f"{page.name} must reference the shared stylesheet exactly once")
        page.write_text(html.replace(link, f"<style>\n{css}\n</style>"), encoding="utf-8")


if __name__ == "__main__":
    embed_styles(Path(sys.argv[1]))
