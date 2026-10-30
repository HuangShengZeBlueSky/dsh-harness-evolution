"""Offline native-runtime check. Neither provider nor optimizer is a real model."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class ScriptedProvider:
    def __enter__(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                tools=[m.get('content','') for m in body['messages'] if m['role']=='tool']
                last=tools[-1] if tools else ''
                action='take' if 'RECOVER:' in last else 'clean' if 'Object taken.' in last else 'put' if 'Object cleaned.' in last else 'finish'
                message={'role':'assistant','content':None,'tool_calls':[{'id':f'call-{len(body["messages"])}','type':'function',
                         'function':{'name':'act','arguments':json.dumps({'command':action})}}]}
                response={'choices':[{'message':message,'finish_reason':'tool_calls'}],
                          'usage':{'prompt_tokens':1,'completion_tokens':1}}
                self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
                self.wfile.write(json.dumps(response).encode())
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        return f'http://127.0.0.1:{self.server.server_port}/v1'

    def __exit__(self,*args):
        self.server.shutdown();self.server.server_close()
