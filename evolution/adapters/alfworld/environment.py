"""Fixed ALFWorld environment wrapper aligned to the local Life-Harness evaluation settings."""
import json
import threading
from pathlib import Path

import numpy as np
import textworld
from alfworld.agents.environment.alfred_tw_env import AlfredDemangler
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction

ENV_LOCK = threading.RLock()


class Environment:
    def __init__(self, config):
        self.config = config
        self.env = None
        self.choices = []

    def visible(self, state, initial=False):
        self.choices = list(state.admissible_commands)
        text = str(state.feedback)
        if initial:
            text = '\n'.join(text.split('\n\n')[1:])
            text = 'Here is your task. ' + text
        elif text.startswith('You arrive at loc '):
            text = text[text.find('. ') + 2:]
        return text + ' AVAILABLE ACTIONS: ' + '\n'.join(self.choices) + '\n'

    def reset(self, task_id, seed, split):
        game = Path(self.config['data_root']) / task_id / 'game.tw-pddl'
        with ENV_LOCK:
            self.env = textworld.start(str(game), request_infos=textworld.EnvInfos(won=True, admissible_commands=True),
                                       wrappers=[AlfredDemangler(shuffle=False)])
            self.env.seed(seed)
            state = self.env.reset()
            observation = self.visible(state, initial=True)
        tools = [{'type':'function','function':{'name':'take_action','description':'Take an action.',
                  'parameters':{'type':'object','properties':{'action':{'type':'string','description':'The action you would like to take'}},
                                'required':['action'],'additionalProperties':False}}}]
        return {'observation':observation,'tools':tools,
                'system_prompt':Path(self.config['system_prompt_file']).read_text()}

    def step(self, name, arguments):
        action = str(arguments.get('action', '')).strip().lower().split('\n')[0]
        if self.choices and action not in self.choices:
            scores = [sentence_bleu([choice.split()], action.split(), smoothing_function=SmoothingFunction().method4)
                      for choice in self.choices]
            index = int(np.argmax(np.array(scores)))
            if scores[index] > 0.01:
                action = self.choices[index]
        with ENV_LOCK:
            state, _, done = self.env.step(action)
            return {'observation':self.visible(state),'score':float(bool(state.won)),
                    'done':bool(done or state.won),'error':False,'executed_action':action}

    def close(self):
        if self.env:
            with ENV_LOCK:
                self.env.close()


def create_environment(config):
    return Environment(config)
