from pathlib import Path
from astra_evolve.config import load_config
from astra_evolve.project import Project

def campaign(config):
    variant=load_config(config).get('loop',{}).get('variant','Base')
    if variant in ['L1','L2','L3']:
        from .loops.l123 import LoopProject
        return LoopProject(config)
    if variant in ['L4','L5','Resume']:
        from .loops.l45 import Campaign
        return Campaign(config)
    if variant=='L6':
        from .loops.l6 import Campaign
        return Campaign(config)
    if variant in ['L7','L8-internal','L8-external','L9']:
        from .loops.l789 import Campaign
        return Campaign(config)
    if variant in ['Base','M1','M2']:return Project(config)
    raise ValueError('Unknown loop.variant: '+variant)
