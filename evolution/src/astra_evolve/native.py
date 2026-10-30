"""Select the benchmark adapter explicitly; loop policies share one Project."""
from importlib import import_module

def run_native(cfg, base, request):
    name=cfg['benchmark'].get('runner','webshop')
    if name not in ['dbbench','osbench','webshop','alfworld','demo']:
        raise ValueError('Unknown benchmark.runner: '+name)
    module='webshop' if name in ['alfworld','demo'] else name
    return import_module('dsh_evolve.runners.'+module).run_native(cfg,base,request)
