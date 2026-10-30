import copy,json
from pathlib import Path
from .dbbench_base import run_native as original

def run_native(cfg,base,request):
 from dsh_evolve.adapters.db_proxy import ComparisonProxy
 from astra_evolve.records import results,jsonl,write
 root=Path(base).resolve()
 protocol=dict(cfg['benchmark']['transport'])
 folder=Path(request['output']).parent
 arm='life_harness' if cfg['benchmark']['environment'].get('life_harness') else 'champion'
 protocol_root=folder/'transport';protocol_root.mkdir(exist_ok=True)
 source=protocol_root/'source'
 if not source.exists():source.symlink_to(root/'source',target_is_directory=True)
 cfg=copy.deepcopy(cfg)
 with ComparisonProxy(protocol_root,arm,protocol) as endpoint:
  cfg['benchmark']['model']['base_url']=endpoint
  original(cfg,base,request)
 rows=[]
 for line in Path(request['output']).read_text().splitlines():
  row=json.loads(line);sid=row.get('session_id');actual=jsonl(protocol_root/arm/'proxy'/str(sid)/'requests.jsonl') if sid else []
  if actual:
   row['native_pre_proxy_requests']=row['requests'];row['requests']=actual
  rows.append(row)
 Path(request['output']).write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in rows))
