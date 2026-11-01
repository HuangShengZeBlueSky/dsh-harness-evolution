from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
def build(root=ROOT):
 p=root/'results/architecture-pilot.json'
 if not p.exists():return
 d=json.loads(p.read_text());s=(root/'tools/pilot-template.html').read_text();s=s.replace('__PILOT_DATA__',json.dumps(d,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c'));(root/'site/pilot.html').write_text(s)
 print('Pilot snapshot:',len(d['groups']),'groups;',d['decisions'],'decisions')
if __name__=='__main__':build()
