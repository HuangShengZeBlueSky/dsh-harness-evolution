"""Add a maintainer-reviewed artifact and measurement. No remote publishing side effects."""
from pathlib import Path
import argparse,json,shutil
import yaml
import build

p=argparse.ArgumentParser();p.add_argument('--artifact',required=True);p.add_argument('--result',required=True);a=p.parse_args()
source=Path(a.artifact).resolve();r=yaml.safe_load(Path(a.result).read_text())
target=build.ROOT/'harnesses'/r['benchmark']/r['release_id'];result=build.ROOT/'results'/f"{r['benchmark']}--{r['release_id']}.json"
if target.exists() or result.exists():raise SystemExit('Release already exists. Use a new release_id; preserve published history.')
assert r['benchmark'] in build.NAMES
assert '/' not in r['release_id'] and '..' not in r['release_id']
assert r['evaluation_complete'] and r['coverage']['invalid_episodes']==0
r['artifact']=str(target.relative_to(build.ROOT))
shutil.copytree(source,target)
try:
 build.validate(r)
 result.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');build.main()
except Exception:
 if result.exists():result.unlink()
 shutil.rmtree(target)
 raise
print('Release prepared. Review git diff, then commit and push to publish the updated leaderboard.')
