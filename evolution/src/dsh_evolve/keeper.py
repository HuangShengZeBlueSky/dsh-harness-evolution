"""Persistent optimizer process; loop stages remain under the model's control."""
import fcntl,json,shlex,subprocess,sys,time
from astra_evolve.records import command,write

def prompt(project):
    helper=shlex.join([sys.executable,'-m','dsh_evolve'])
    config=shlex.quote(str(project.path))
    mode=project.cfg.get('loop',{}).get('variant','Base')
    return f"""本组 {project.cfg.get('domain','benchmark')}，循环 {mode}，共 {project.cfg['rounds']} 轮。配置以 experiment.yaml 为准。
先读 PLAYBOOK.md、{project.cfg['harness_api']}、progress.txt 和父版实际源码/训练轨迹。当前入口为 {helper}。
共用流程：status → prepare → 读失败与成功对照 → 当前能力和机制假设 → 实现 → evaluate → report → decide → 复盘。
L4/L5先更新候选 agent-state.md 和 proposal.md；L6–L9先写 analysis.json 并执行 plan，再改代码。
L8经验由独立学习调用产生，说明适用/不适用；L9按计划通过component导入，不把组合视为自动有效。
L3从归档分支继续，归档保留不等于冠军晋升。其余按本组当前最佳继续。
命令示例：
{helper} status {config}
{helper} prepare {config} v01
{helper} plan {config} v01
{helper} evaluate {config} v01 --split development
{helper} report {config} v01
{helper} decide {config} v01 --adopt --reason '实际证据'
拒绝用 --reject。已有完整有效评测复用。报告检查真实输入、运行器控制、行为变化与修复退步，不把加载等同收益。
采用门槛由本组策略执行；不得修改运行器、任务、环境、评分、模型和预算来改变门槛。
全部决定完成后 {helper} finish {config}；测试只报告，不用于设计或选下一轮。不得读取其他实验的测试。
保持同一优化会话；除L8/L9规定的学习调用外，不增加优化模型或子代理。维护简明progress.txt。
"""

def evaluating(project):
    with (project.root / 'evaluation.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return False
        except BlockingIOError:
            return True


def run(project):
    project.freeze_experiment()
    root = project.root
    with (root / 'keeper.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        initial = prompt(project)
        (project.base / 'AGENTS.md').write_text(initial, encoding='utf-8')
        (root / 'initial-prompt.txt').write_text(initial, encoding='utf-8')
        continuation = f'继续本组 {project.cfg["rounds"]} 轮进化。读 experiment.yaml、AGENTS.md、progress.txt 和真实状态。保留有效评测，按配置策略采用，全部轮次结束后 finish。'
        session_file = root / 'session.txt'
        failures = 0
        number = max([int(p.stem.split('-')[1]) for p in root.glob('turn-*-events.jsonl')], default=0)
        while not (root / 'completed.txt').exists():
            while evaluating(project):
                time.sleep(10)
            if (root / 'completed.txt').exists():
                break
            number += 1
            session = session_file.read_text().strip() if session_file.exists() else None
            settings = project.cfg['optimizer']
            transport_path = project.base / 'runtime-control.json'
            transport = json.loads(transport_path.read_text()) if transport_path.exists() else {}
            args = command(transport.get('optimizer_command', settings.get('command', ['codex']))) + ['exec', '--sandbox', settings.get('sandbox', 'workspace-write'),
                    '-c', 'approval_policy="never"', '-c', 'model_reasoning_effort=' + json.dumps(settings.get('effort', 'high'))]
            if session:
                args += ['resume']
            args += ['--json', '--skip-git-repo-check', '--model', settings.get('model', 'gpt-6-astra'),
                     '--output-last-message', str(root / f'turn-{number:03d}-reply.txt')]
            args += ([session] if session else []) + ['-']
            write(root / 'keeper-status.json', {'turn': number, 'session': session, 'status': 'running'})
            print(f'Optimizer turn {number}; session={session or "new"}', flush=True)
            failed = False
            with (root / f'turn-{number:03d}-events.jsonl').open('w') as out, (root / f'turn-{number:03d}-stderr.txt').open('w') as err:
                proc = subprocess.Popen(args, cwd=project.base, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=err, text=True, encoding='utf-8')
                try:
                    proc.stdin.write(continuation if session else initial);proc.stdin.close()
                    for line in proc.stdout:
                        out.write(line);out.flush()
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if event.get('type') == 'thread.started':
                            found = event['thread_id']
                            if session and found != session:
                                raise RuntimeError('Conversation identity changed')
                            session = found;session_file.write_text(found + '\n')
                        if event.get('type') == 'turn.failed':
                            failed = True
                    code = proc.wait()
                finally:
                    if proc.poll() is None:
                        proc.terminate();proc.wait()
            if not session:
                raise RuntimeError('No session returned by Codex; check login and model access')
            if code or failed:
                failures += 1
                if failures >= 3:
                    raise RuntimeError('Three failed optimizer turns; repair the service then rerun to resume')
            else:
                failures = 0
            if not (root / 'completed.txt').exists():
                time.sleep(5)
        # A marker alone is not enough: verify the required completed evaluations.
        project.finish()
        write(root / 'keeper-status.json', {'status': 'complete', 'session': session_file.read_text().strip()})
