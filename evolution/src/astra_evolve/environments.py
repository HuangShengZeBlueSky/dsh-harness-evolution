"""Environment adapters. Scores are computed here, outside the plugin runtime."""
import importlib.util
import os
import sys
from pathlib import Path

ACT = [{"type": "function", "function": {"name": "act", "description": "Execute one command in the environment and observe its result.",
       "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"], "additionalProperties": False}}}]


class AlfworldEnvironment:
    def __init__(self, config):
        self.config = config
        self.env = None

    def reset(self, task_id, seed, split):
        import textworld
        from alfworld.agents.environment.alfred_tw_env import AlfredDemangler
        root = Path(os.path.expandvars(self.config["data_root"])).expanduser().resolve()
        game = (root / task_id / "game.tw-pddl").resolve()
        if root not in game.parents or not game.is_file():
            raise ValueError(f"ALFWorld game not found: {task_id}")
        # Use the official ALFWorld demangler and TextWorld PDDL engine, without expert plans.
        self.env = textworld.start(str(game), request_infos=textworld.EnvInfos(won=True, admissible_commands=True),
                                   wrappers=[AlfredDemangler(shuffle=False)])
        self.env.seed(seed)
        state = self.env.reset()
        return {"observation": self.visible(state), "tools": ACT,
                "system_prompt": "Solve the household task described by the environment. Use act with one ALFWorld command at a time. "
                                 "Use only observed objects and feedback. The environment determines success."}

    def visible(self, state):
        text = str(state.feedback)
        if self.config.get("admissible_commands", False):
            text += "\nAvailable commands: " + "; ".join(state.admissible_commands)
        return text

    def step(self, name, arguments):
        if name != "act":
            return {"observation": "Unknown action tool", "error": True, "score": 0, "done": False}
        state, reward, done = self.env.step(arguments["command"])
        won = bool(state.won)
        return {"observation": self.visible(state), "score": float(won), "done": bool(done or won), "error": False}

    def close(self):
        if self.env:
            self.env.close()


class DemoEnvironment:
    """Deterministic mini task for installation, not evidence of model learning."""
    def __init__(self, config):
        self.stage = 0

    def reset(self, task_id, seed, split):
        self.stage = 0
        return {"observation": f"Task {task_id}: take an object, clean it and put it on the table. Commands: take, clean, put, finish.",
                "tools": ACT, "system_prompt": "Complete the requested task with the act tool."}

    def step(self, name, arguments):
        command = arguments.get("command", "")
        if command == "finish":
            return {"observation": "Stopped before completing the task.", "score": 0, "done": True}
        expected = ["take", "clean", "put"][min(self.stage, 2)]
        if command == expected:
            self.stage += 1
            return {"observation": {"take": "Object taken.", "clean": "Object cleaned.", "put": "Object placed. Task complete."}[command],
                    "score": float(self.stage == 3), "done": self.stage == 3}
        return {"observation": "That command does not advance the task.", "score": 0, "done": False}

    def close(self):
        pass


def factory(bench, base):
    kind = bench["kind"]
    config = bench.get("environment", {})
    if kind == "alfworld":
        return lambda: AlfworldEnvironment(config)
    if kind == "demo":
        return lambda: DemoEnvironment(config)
    if kind == "python":
        sys.path.insert(0, str(Path(base).resolve()))
        path, function = config["factory"].rsplit(":", 1)
        spec = importlib.util.spec_from_file_location("user_benchmark", Path(base) / path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return lambda: getattr(module, function)(config)
    raise ValueError(f"Unknown built-in benchmark kind: {kind}")
