from astra_evolve.config import load_config
from astra_evolve.project import Project

def campaign(config):
    variant = load_config(config).get("loop", {}).get("variant", "Base")
    if variant in ("L4", "L5", "Resume"):
        from .loops.l4 import Campaign
        return Campaign(config)
    if variant == "Base":
        return Project(config)
    raise ValueError("Choose a released L4 or historical artifact profile")
