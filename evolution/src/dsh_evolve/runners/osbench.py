import concurrent.futures
import contextlib
import json
import os
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from astra_evolve.environments import factory
from astra_evolve.records import jsonl, write


def rpc(url, body=None, timeout=120):
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                    headers={"Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Native bridge HTTP {exc.code}: {exc.read().decode()[:500]}") from None


def _run_native(cfg, base, request):
    bench = cfg["benchmark"]
    folder = Path(request["output"]).parent
    traces = folder / "native"
    traces.mkdir(exist_ok=True)
    sessions = {}
    tasks_lock = threading.Lock()
    output_lock = threading.Lock()

    class Executor(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            try:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                state = sessions[body["executor_id"]]
                with state["lock"]:
                    if state["done"]:
                        result = {"observation": "Episode already ended.", "error": True}
                    else:
                        call = body["call"]
                        result = state["env"].step(call["name"], call["arguments"])
                        state.update(score=float(result["score"]), done=bool(result["done"]))
                        state["environment_actions"].append({"call_id":call["id"],"requested":call["arguments"],"executed_action":result.get("executed_action")})
                    payload = {"content": str(result["observation"]), "error": bool(result.get("error", False))}
                self.send_response(200)
            except Exception as exc:
                payload = {"error": str(exc)}
                self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(payload).encode())

    server = ThreadingHTTPServer(("127.0.0.1", 0), Executor)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    model = bench["model"]
    ready = folder / "host-ready.json"
    ready.unlink(missing_ok=True)
    host_config = {"readyFile": str(ready), "logRoot": str(traces), "sessionRoot": str(folder / "sessions"),
                   "methods": request["methods"], "workspace": str(base), "endpoint": model["base_url"].rstrip("/"),
                   "model": model["name"], "temperature": model.get("temperature", 0),
                   "maxTokens": model.get("max_tokens", 2048), "maxRetries": model.get("max_retries", 2),
                   "timeoutMs": int(model.get("timeout_seconds", 90) * 1000), "apiKeyEnv": model.get("api_key_env"),
                   "sendSeed": model.get("send_seed", True), "extraBody": model.get("extra_body", {}),
                   "maxSteps": bench.get("max_steps", 50)}
    write(folder / "host-config.json", host_config)
    runtime = (Path(base) / cfg["runtime"]).resolve()
    host_log = (folder / "host.log").open("a")
    host = None
    make_env = factory(bench, base)
    try:
        host = subprocess.Popen([cfg.get("node", "node"), str(runtime / "host.mjs"), str(folder / "host-config.json")],
                                cwd=base, stdout=host_log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 45
        while not ready.exists():
            if host.poll() is not None:
                raise RuntimeError("Native DSH host exited; see " + str(folder / "host.log"))
            if time.monotonic() > deadline:
                raise RuntimeError("Native DSH startup timed out")
            time.sleep(0.2)
        port = json.loads(ready.read_text())["port"]
        url = f"http://127.0.0.1:{port}"

        def episode(task):
            identity = f"{task['task_id']}:{task['trial']}:{task['seed']}"
            env = make_env()
            state = {"env": env, "score": 0.0, "done": False, "lock": threading.Lock(), "environment_actions": []}
            with tasks_lock:
                sessions[identity] = state
            sid = None
            messages = []
            start = time.monotonic()
            expires = start + bench.get("timeout_seconds", 300)

            def remaining():
                if time.monotonic() >= expires:
                    raise TimeoutError("Episode time budget exhausted")
                return max(0.1, expires - time.monotonic())

            try:
                initial = env.reset(task["task_id"], task["seed"], request["split"])
                messages = [{"role": "user", "content": initial["observation"]}]
                opened = rpc(url + "/open", {"seed": task["seed"], "system_prompt": initial["system_prompt"],
                             "history": [], "tools": initial["tools"], "executor_id": identity,
                             "executor_url": f"http://127.0.0.1:{server.server_port}/execute"}, remaining())
                sid = opened["session_id"]
                followup = messages[:]
                attempts = 0
                reason = "model_call_budget"
                for _ in range(bench.get("max_model_calls", 60)):
                    reply = rpc(url + "/advance", {"session_id": sid, "input": followup}, remaining())["response"]
                    message = reply["choices"][0]["message"]
                    messages.append(message)
                    calls = (message.get("tool_calls") or [])[:1]
                    if not calls:
                        if bench.get('no_tool_feedback'):
                            msg = {'role': 'user', 'content': 'Harness: your response did not contain a valid tool call. Please use the function calling API to call a tool.' if '<tool_call>' in str(message.get('content') or '').lower() else bench['no_tool_feedback']}
                            messages.append(msg);followup=[msg]
                            continue
                        reason = "agent_stop"
                        break
                    followup = []
                    for call in calls:
                        receipt = rpc(url + "/result", {"session_id": sid, "call_id": call["id"]}, remaining())
                        attempts = receipt["attempts"]
                        msg = {"role": "tool", "tool_call_id": call["id"], "content": receipt["content"]}
                        messages.append(msg)
                        followup.append(msg)
                    if state["done"]:
                        reason = "environment_done"
                        break
                    if attempts >= bench.get("max_steps", 50):
                        reason = "action_budget"
                        break
                row = {**task, "valid": True, "score": state["score"], "termination_reason": reason}
            except TimeoutError:
                row = {**task, "valid": True, "score": state["score"], "termination_reason": "timeout"}
            except Exception as exc:
                row = {**task, "valid": True, "score": 0.0, "termination_reason": "context_limit"} if "CONTEXT_LIMIT" in str(exc) else {**task, "valid": False, "error": str(exc)}
            finally:
                if sid:
                    with contextlib.suppress(Exception):
                        rpc(url + "/close", {"session_id": sid}, 10)
                with contextlib.suppress(Exception):
                    env.close()
                with tasks_lock:
                    sessions.pop(identity, None)
            record = {**row, "session_id": sid, "messages": messages, "elapsed_seconds": time.monotonic() - start,
                      "environment_actions": state["environment_actions"],
                      "requests": jsonl(traces / sid / "requests.jsonl") if sid else [],
                      "activations": jsonl(traces / sid / "activations.jsonl") if sid else [],
                      "executions": jsonl(traces / sid / "executions.jsonl") if sid else []}
            with output_lock, Path(request["output"]).open("a", encoding="utf-8") as out:
                out.write(json.dumps(record, ensure_ascii=False) + "\n")
            print(f"{task['task_id']} repeat={task['trial']} valid={row['valid']} score={row.get('score')}", flush=True)

        from collections import deque
        scheduling_file = Path(base) / 'runtime-control.json'
        pending = deque(request['episodes'])
        active = set()
        completed_count = 0
        last_written = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=50) as pool:
            while pending or active:
                scheduling = json.loads(scheduling_file.read_text()) if scheduling_file.exists() else {}
                workers = max(1, min(50, int(scheduling.get('episode_concurrency', bench.get('concurrency', 1)))))
                while pending and len(active) < workers:
                    active.add(pool.submit(episode, pending.popleft()))
                now = time.time()
                if now - last_written >= 5 or not active:
                    write(folder / 'execution-schedule.json', {'episode_concurrency': workers,
                          'active_tasks': len(active), 'pending_tasks': len(pending), 'completed_this_launch': completed_count,
                          'configured_default': bench.get('concurrency', 1), 'control_file': str(scheduling_file),
                          'updated_at': now, 'live_adjustment': True,
                          'note': 'Scheduling only; task/model/scorer/per-episode budgets unchanged.'})
                    last_written = now
                done, active = concurrent.futures.wait(active, timeout=1, return_when=concurrent.futures.FIRST_COMPLETED)
                for future in done:
                    future.result()
                    completed_count += 1
            write(folder / 'execution-schedule.json', {'episode_concurrency': workers,'active_tasks':0,
                  'pending_tasks':0,'completed_this_launch':completed_count,'updated_at':time.time(),
                  'live_adjustment':True,'status':'complete'})

    finally:
        if host is not None:
            host.terminate()
            try:
                host.wait(timeout=15)
            except subprocess.TimeoutExpired:
                host.kill()
                host.wait()
        host_log.close()
        server.shutdown()
        server.server_close()


def run_native(cfg, base, request):
    import copy
    from dsh_evolve.adapters.os_proxy import ComparisonProxy
    root=Path(base).resolve()
    config=copy.deepcopy(cfg)
    output=Path(request['output'])
    arm='life_harness' if cfg['benchmark']['environment'].get('life_harness') else 'champion'
    protocol=dict(cfg['benchmark']['transport'])
    with ComparisonProxy(root,arm,protocol,output.parent/'proxy') as endpoint:
        config['benchmark']['model']['base_url']=endpoint
        _run_native(config,base,request)
    rows=jsonl(output)
    for row in rows:
        sid=row.get('session_id')
        actual=jsonl(output.parent/'proxy'/sid/'requests.jsonl') if sid else []
        if actual:
            row['native_pre_proxy_requests']=row['requests'];row['requests']=actual
    output.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
