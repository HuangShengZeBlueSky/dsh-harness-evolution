"""Resolve deployment endpoints while keeping model identity and budgets in YAML."""
import os
import re
from pathlib import Path
import yaml


def load_config(path):
    def resolve(value):
        if isinstance(value, dict):
            return {k: resolve(v) for k, v in value.items()}
        if isinstance(value, list):
            return [resolve(v) for v in value]
        if isinstance(value, str):
            def variable(match):
                name = match.group(1)
                if name not in os.environ:
                    raise ValueError(f'Set environment variable {name} before running this configuration')
                return os.environ[name]
            return re.sub(r'\$\{([A-Za-z_][A-Za-z_0-9]*)\}', variable, value)
        return value
    return resolve(yaml.safe_load(Path(path).read_text(encoding='utf-8')))
