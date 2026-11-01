"""Render a standalone architecture lab from shared content and measured evidence."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def build(root=ROOT):
 content=json.loads((root/'results/architecture-methodology.json').read_text())
 evidence=json.loads((root/'results/architecture-evidence.json').read_text())
 encode=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
 template=(root/'tools/architecture-template.html').read_text()
 pilot=json.loads((root/'results/architecture-pilot.json').read_text()) if (root/'results/architecture-pilot.json').exists() else {}
 result=template.replace('__CONTENT_DATA__',encode(content)).replace('__EVIDENCE_DATA__',encode(evidence)).replace('__PILOT_DATA__',encode(pilot))
 (root/'site').mkdir(exist_ok=True);(root/'site/architecture.html').write_text(result)
 print('Architecture lab:',len(content['modules']),'modules;',len(evidence['runs']),'run records;',len(content['proposals']),'unrun proposals')
if __name__=='__main__':build()
