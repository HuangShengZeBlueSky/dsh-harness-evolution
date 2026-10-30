"""Same inference transport for both arms; published FourHookSession for Life-Harness."""
import copy
import os
import importlib.util
import json
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def post(url, data, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(data).encode(), headers={**({'Authorization':'Bearer '+os.environ['BENCH_API_KEY']} if os.environ.get('BENCH_API_KEY') else {}),'Content-Type':'application/json','X-Qwen-Experiment':os.environ.get('DSH_EXPERIMENT_ID','dsh-evolve')})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=timeout) as response:
        return json.load(response)


class ComparisonProxy:
    def __init__(self, root, arm, protocol):
        self.root=Path(root);self.arm=arm;self.protocol=protocol;self.states={};self.contexts={}
        self.logs=self.root/arm/'proxy';self.logs.mkdir(parents=True,exist_ok=True)
        self.harness=load_module('fixed_life_harness',self.root/'source/AgentBench/src/server/harness/dbbench.py')
        self.session_module=load_module('fixed_life_session',self.root/'source/AgentBench/src/server/harness/session.py')

    def log(self,sid,name,data):
        folder=self.logs/sid;folder.mkdir(parents=True,exist_ok=True)
        with (folder/name).open('a') as handle:handle.write(json.dumps(data,ensure_ascii=False)+'\n')

    def infer(self,sid,body):
        token_input={k:body[k] for k in ['model','messages','tools'] if k in body}
        token_input['add_generation_prompt']=True
        counted=post(self.protocol['tokenizer_url'],token_input,30)['count']
        if counted+body['max_tokens']+256>self.protocol['max_context_tokens']:
            self.log(sid,'budget.jsonl',{'input_tokens':counted,'max_output_tokens':body['max_tokens'],'decision':'CONTEXT_LIMIT'})
            raise RuntimeError('CONTEXT_LIMIT: common input+output context budget exceeded')
        for attempt in range(self.protocol['transport_retries']+1):
            self.log(sid,'requests.jsonl',{'at':time.time(),'attempt':attempt,'input_tokens':counted,'body':body})
            try:
                response=post(self.protocol['model_url'],body,self.protocol['request_timeout_seconds'])
                self.log(sid,'responses.jsonl',{'at':time.time(),'response':response})
                return response
            except Exception as exc:
                self.log(sid,'transport.jsonl',{'at':time.time(),'attempt':attempt,'error':type(exc).__name__})
                if attempt==self.protocol['transport_retries']:raise
                time.sleep(1)

    def handle(self,sid,body):
        if self.arm=='champion':
            response=self.infer(sid,body)
        else:
            if sid not in self.states:
                proxy=self
                class Session:
                    def __init__(self):
                        self.history=[];self.tools=[];self.last_response=None
                        self.controller=SimpleNamespace(env_output=SimpleNamespace(history=[]))
                    def inject(self,item):self.history.append(copy.deepcopy(item))
                    def cover(self,history):self.history=copy.deepcopy(history)
                    def set_tools(self,tools):self.tools=copy.deepcopy(tools)
                    def set_full_history(self,enabled):pass
                    def sync_action(self):
                        actual={**body,'messages':self.history,'tools':self.tools}
                        self.last_response=proxy.infer(sid,actual)
                        return SimpleNamespace(messages=[copy.deepcopy(self.last_response['choices'][0]['message'])])
                session=Session()
                switches=SimpleNamespace(h2_enabled=True,h3_enabled=True,h4_enabled=True,h5_enabled=True)
                wrapper=self.session_module.FourHookSession(session,self.harness.Harness(),body['tools'],self.protocol['max_model_calls'],switches,task_context=self.contexts[sid])
                self.states[sid]={'session':session,'wrapper':wrapper,'native_length':0}
            state=self.states[sid];session=state['session'];wrapper=state['wrapper']
            incoming=body['messages'];start=state['native_length']
            if start>len(incoming):raise RuntimeError('Native history unexpectedly shortened')
            for item in incoming[start:]:
                if item['role']!='assistant' and not (state.get('suppressed') and item.get('content')=='No executable tool calls found. Please call a tool.'):
                    wrapper.inject(copy.deepcopy(item))
            state['native_length']=len(incoming)
            # Update request-specific fields, while preserving FourHookSession's public history semantics.
            def call():
                actual={**body,'messages':copy.deepcopy(session.history),'tools':copy.deepcopy(session.tools)}
                session.last_response=self.infer(sid,actual)
                return SimpleNamespace(messages=[copy.deepcopy(session.last_response['choices'][0]['message'])])
            session.sync_action=call
            output=wrapper.sync_action()
            state['suppressed']=wrapper.consume_h2_suppressed()
            response=copy.deepcopy(session.last_response)
            response['choices'][0]['message']=output.messages[0] if output.messages else {'role':'assistant','content':''}
            self.log(sid,'harness-trace.jsonl',{'turn':wrapper.turn,'trace':wrapper.trace})
        self.log(sid,'effective-responses.jsonl',{'at':time.time(),'response':response})
        return response

    def __enter__(self):
        proxy=self
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                try:
                    body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                    if self.path=='/register':
                        proxy.contexts[body['session_id']]=body['context'];self.send_response(200);self.end_headers();self.wfile.write(b'{}');return
                    sid=self.headers['X-Astra-Session']
                    response=proxy.handle(sid,body);status=200
                except Exception as exc:
                    response={'error':str(exc)};status=400 if 'CONTEXT_LIMIT' in str(exc) else 503
                self.send_response(status);self.send_header('Content-Type','application/json');self.end_headers()
                self.wfile.write(json.dumps(response).encode())
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        return f'http://127.0.0.1:{self.server.server_port}/v1'

    def __exit__(self,*args):
        self.server.shutdown();self.server.server_close()
