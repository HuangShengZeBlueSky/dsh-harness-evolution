"""Single command entrypoint; the experiment YAML selects the loop strategy."""
from pathlib import Path
import argparse,json,shutil,yaml
from astra_evolve.records import read,write,summary
from .factory import campaign
ROOT=Path(__file__).resolve().parents[2]

def initialize(directory,profile,assets=None,baseline=None,components=None):
    template=ROOT/'profiles'/profile
    if not (template/'experiment.yaml').exists():raise ValueError('Choose a profile listed by dsh-evolve profiles')
    cfg=yaml.safe_load((template/'experiment.yaml').read_text())
    if cfg['loop'].get('requires_seed_artifact') and not baseline:raise ValueError('This profile needs --baseline with its chosen previous harness')
    dest=Path(directory).resolve();shutil.copytree(template,dest)
    domain=profile.split('-')[0]
    shutil.copytree(ROOT/'src/astra_evolve/assets/runtime',dest/'runtime')
    shutil.copy2(ROOT/'adapters'/domain/'environment.py',dest/'environment.py')
    if baseline:shutil.copytree(Path(baseline).resolve(),dest/'baseline',ignore=shutil.ignore_patterns('node_modules'))
    else:
        (dest/'baseline/plugins').mkdir(parents=True)
        write(dest/'baseline/composition.json',{'methods':[],'selected':[]})
    for name in ['INNER_PROMPT.txt','OUTER_PROMPT.txt']:shutil.copy2(ROOT/'prompts'/name,dest/name)
    if assets:
        assetroot=Path(assets).resolve()
        for name in ['source','data','fixtures','deps']:
            if (assetroot/name).exists():(dest/name).symlink_to(assetroot/name,target_is_directory=True)
    reference=ROOT/'benchmark_sources'/domain
    if reference.exists() and not (dest/'source').exists():
        shutil.copytree(reference,dest/'source')
    for field in ['system_prompt_file','tools_file']:
        if cfg['benchmark']['environment'].get(field):cfg['benchmark']['environment'][field]=str(dest/Path(cfg['benchmark']['environment'][field]).name)
    if components:
        items=[]
        for index,folder in enumerate(components):
            src=Path(folder).resolve();bundle=f'prior-{index+1}';c=read(src/'composition.json')
            for method in c['methods']:
                if method['id'] in c['selected']:items.append({'id':bundle+'/'+method['id'],'bundle':bundle,'path':str(src),'method':method,'training_materials':None})
        write(dest/'components/index.json',{'components':items,'training_sources':[]})
    (dest/'progress.txt').write_text('Initialized; no evaluations or decisions yet.\n')
    (dest/'experiment.yaml').write_text(yaml.safe_dump(cfg,allow_unicode=True,sort_keys=False))
    print(dest/'experiment.yaml')

def bootstrap(c):
    c.root.mkdir(parents=True,exist_ok=True)
    c.evaluate('baseline','development')
    if c.cfg.get('loop',{}).get('variant') in ['L1','L2','L3'] and not (c.root/'archive.json').exists():
        val=summary(c.rows('baseline','validation'))['mean']
        write(c.root/'archive.json',{'entries':[{'candidate':'baseline','validation':val,'uses':0}]})
        write(c.root/'selection.json',{'candidate':'baseline','validation':val})
    if hasattr(c,'initialize'):c.initialize()

def main():
    ap=argparse.ArgumentParser(description=__doc__);sp=ap.add_subparsers(dest='action',required=True)
    p=sp.add_parser('init');p.add_argument('directory');p.add_argument('--profile',required=True);p.add_argument('--assets');p.add_argument('--baseline');p.add_argument('--components',nargs='+')
    p=sp.add_parser('demo');p.add_argument('directory')
    p=sp.add_parser('profiles')
    for action in ['setup','bootstrap','run','status','finish','prepare','plan','component','evaluate','report','decide','learn']:
        p=sp.add_parser(action);p.add_argument('config');p.add_argument('version',nargs='?');p.add_argument('--parent');p.add_argument('--part');p.add_argument('--split',choices=['train','validation','development','test'],default='development');p.add_argument('--batch',type=int);p.add_argument('--adopt',action='store_true');p.add_argument('--reject',action='store_true');p.add_argument('--reason',default='')
    a=ap.parse_args()
    if a.action=='profiles':print('\n'.join(p.name for p in sorted((ROOT/'profiles').iterdir()) if (p/'experiment.yaml').exists()));return
    if a.action=='init':initialize(a.directory,a.profile,a.assets,a.baseline,a.components);return
    if a.action=='demo':
        from astra_evolve.cli import demo
        demo(a.directory);return
    if a.action=='setup':
        from astra_evolve.cli import setup
        setup(a.config);return
    c=campaign(a.config)
    if a.action=='status':
        state={'loop':c.cfg.get('loop'),'best':c.best(),'decisions':len(list((c.root/'decisions').glob('v*.json'))),'rounds':c.cfg['rounds'],'completed':(c.root/'completed.txt').exists()}
        if c.cfg.get('loop',{}).get('variant')=='L3':
            from .loops.loop_policy import parent
            state.update(next_parent=parent(c.root,c.cfg),archive=read(c.root/'archive.json'))
        print(json.dumps(state,ensure_ascii=False));return
    if a.action=='bootstrap':bootstrap(c)
    elif a.action=='run':
        bootstrap(c)
        from .keeper import run
        run(c)
    elif a.action=='prepare':
        if c.cfg.get('loop',{}).get('variant') in ['Base','M1','M2']:c.prepare(a.version,a.parent or c.best())
        else:c.prepare(a.version,a.parent)
    elif a.action=='evaluate':c.evaluate(a.version,a.split,a.batch)
    elif a.action=='report':print(json.dumps(c.report(a.version),ensure_ascii=False))
    elif a.action=='component':c.component(a.version,a.part)
    elif a.action=='decide':
        if a.adopt==a.reject:raise ValueError('Choose --adopt or --reject')
        c.decide(a.version,a.adopt,a.reason)
    elif a.action=='finish':c.finish()
    else:getattr(c,a.action)(a.version)
if __name__=='__main__':main()
