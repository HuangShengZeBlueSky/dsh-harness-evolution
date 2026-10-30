from __future__ import annotations

import asyncio
import copy
import glob
import json
import logging
import os
import random
import re
import traceback
import weakref
from typing import List, Dict, Any, Tuple, TYPE_CHECKING
from typing import Optional

from agentrl.worker.environment import create_controller
from agentrl.worker.task import Task, Session
from agentrl.worker.typings import (AgentCancelledException,
                                    TaskOutput,
                                    TaskSampleExecutionResult,
                                    SampleStatus,
                                    RewardHistoryItem)
from openai.types.chat import (ChatCompletionSystemMessageParam,
                               ChatCompletionToolMessageParam,
                               ChatCompletionUserMessageParam)

from src.server.harness import (
    OSInteractionHarness,
    OSHarnessConfig,
    OSHarnessRuntime,
    rescue_tool_call_from_text,
)
from src.server.harness.session import FourHookSession

from .environment import OSEnvironmentDelegation

if TYPE_CHECKING:
    from agentrl.worker.environment import EnvironmentController


class Container:
    def __init__(self, controller: EnvironmentController, image: str):
        self.image = image
        self.controller = controller
        self.session_id: Optional[str] = None
        self.container_id: Optional[str] = None

    async def initialize(self):
        res = await self.controller.start_session(self.image)
        self.session_id = res[0]
        self.container_id = res[1][self.image]

    async def __aenter__(self):
        await self.initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.cleanup()

    async def cleanup(self):
        await self.controller.end_session(self.session_id)

    async def execute(self, command: str):
        """Asynchronously execute a command."""

        class DummyOutput:
            output: bytes
            exit_code: int

            def __init__(self, code, o):
                self.output = o
                self.exit_code = code

        # call environment controller to renew session
        await self.controller.renew_session(self.session_id)

        if not isinstance(command, str):
            logging.warning("Invalid command type, expected string")
            return DummyOutput(-1, b"")

        output = await self.controller.execute_shell(self.container_id, command)

        # Clean up the output by removing terminal control sequences, removes escape sequences starting with
        # ESC (0x1b), followed by...
        # ... any characters, an '@' character, any characters, ending with '#' or '$'
        output = re.sub(b"\x1b.+@.+[#|$] ", b'', output)
        # ... '[' and any combination of digits and semicolons, ending with a letter (a-z or A-Z)
        output = re.sub(b'\x1b\\[[0-9;]*[a-zA-Z]', b'', output)
        # ... ']' and any digits, a semicolon, any characters except BEL (0x07), and ending with BEL
        output = re.sub(b'\x1b][0-9]*;[^\x07]*\x07', b'', output)
        # ... '[?2004' and either 'h' or 'l'
        output = re.sub(b'\x1b\[\?2004[hl]', b'', output)

        # Remove BEL characters (0x07)
        output = re.sub(b'\x07', b'', output)

        return DummyOutput(0, output)

    async def execute_independent(self, command, *params) -> Tuple[int, bytes, bytes]:
        """Asynchronously execute an independent command."""

        # call environment controller to renew session
        await self.controller.renew_session(self.session_id)

        language, command = command

        if language == "bash":
            cmd = ["bash", "-c", command]
            if params:
                cmd.append("--")
                cmd.extend(params)
        elif language == "python":
            cmd = ["python3", "-c", command, *params]
        elif language == "c++" or language == "c":
            if language == "c++":
                compile_cmd = (
                    "bash",
                    f'echo "{json.dumps(command)}" > /tmp/main.cpp && '
                    f"g++ -o /tmp/a.out /tmp/main.cpp",
                )
            else:  # c
                compile_cmd = (
                    "bash",
                    f'echo "{json.dumps(command)}" > /tmp/main.cpp && '
                    f"gcc -o /tmp/a.out /tmp/main.cpp",
                )

            # Compile code
            await self.execute_independent(compile_cmd, None)
            cmd = ["/tmp/a.out", *params]
        else:
            raise ValueError("Unsupported language")

        return await self.controller.execute_command(self.container_id, cmd)


class JudgeConfig:
    image: str = None
    init_script: List[Tuple[str, str]] = None
    start: Tuple[str, str] = None
    description: str
    check: list = None
    match: dict = None
    example_script: str = None

    def get_evaluation_type(self):
        if self.check:
            return "check"
        elif self.match:
            return "match"

    def get_evaluation_content(self):
        return self.check or self.match


class OSInteraction(Task):

    def __init__(self,
                 data_config,
                 docker_config,
                 round_limit=8,
                 tools=None,
                 env_driver: str = 'docker',
                 env_options: Optional[dict] = None,
                 shuffle_seed=None,
                 sample_size=None,
                 task_ids=None,
                 **kwargs):
        task_ids = task_ids or os.environ.get("OS_TASK_IDS")
        # Harness config — pop before super init
        enabled = kwargs.pop("enabled", False)
        h2 = kwargs.pop("h2", True)
        h3 = kwargs.pop("h3", True)
        h4 = kwargs.pop("h4", True)
        h5 = kwargs.pop("h5", True)
        h5_top_k = kwargs.pop("h5_top_k", 1)
        h5_score_threshold = kwargs.pop("h5_score_threshold", 7.5)
        self.harness_config = OSHarnessConfig(
            enabled=bool(enabled),
            h2_enabled=bool(h2),
            h3_enabled=bool(h3),
            h4_enabled=bool(h4),
            h5_enabled=bool(h5),
            h5_top_k=int(h5_top_k),
            h5_score_threshold=float(h5_score_threshold),
        )
        super().__init__(tools=tools, **kwargs)
        self.round_limit: int = round_limit
        self.data_config = data_config
        self.docker_config = docker_config
        self.base_tools = copy.deepcopy(tools)
        self.tools = tools
        self.full_async = True
        self.shuffle_seed = shuffle_seed
        self.sample_size = sample_size
        self.task_ids = self._parse_task_ids(task_ids)
        self.problem_configs: Dict[str, Dict[str, Any]] = {}  # {index: CONFIG}

        matches = []
        for item in self.data_config["files"]:
            path = item["problem_file"]
            for file in glob.glob(path):
                if file.endswith(".json") or file.endswith(".jsonl"):
                    matches.append(
                        {
                            "problem_file": file,
                            "script_dir": item["script_dir"],
                            "index_prefix": item["index_prefix"]
                                            + os.path.basename(file)
                                            .removesuffix(".json")
                                            .removesuffix(".jsonl")
                                            + "-",
                        }
                    )
        self.data_config["files"] = matches

        next_idx = 0
        for item in self.data_config["files"]:
            problem_file = item["problem_file"]
            single_file_configs = self._load_configs(problem_file, item["script_dir"])
            dict_configs = {}
            for config in single_file_configs:
                dict_configs[next_idx] = {
                    "file": problem_file,
                    "config": config,
                    "index": next_idx,
                }
                next_idx += 1
            self.problem_configs.update(dict_configs)

        logging.info(f"Initialized OSInteraction with {len(self.problem_configs)} problem configs")

        self.env_delegation = OSEnvironmentDelegation(self.docker_config['localhost'])
        self.env_controller = create_controller(env_driver, self.env_delegation, **env_options)
        self.env_controller_background_task = None

        # Monkey-patch: aiodocker 0.26+ _resolve_long_running_timeout expects
        # float, not int. agentrl-worker passes int timeout=30 which falls
        # through to the else branch and crashes.
        _orig_exec_cmd = self.env_controller.execute_command

        async def _patched_execute_command(environment_id, command, timeout=30):
            return await _orig_exec_cmd(environment_id, command, timeout=float(timeout))

        self.env_controller.execute_command = _patched_execute_command

    @staticmethod
    def _parse_task_ids(task_ids) -> Optional[List[int]]:
        if task_ids is None:
            return None
        if isinstance(task_ids, str):
            raw_items = re.split(r"[\s,]+", task_ids.strip())
        elif isinstance(task_ids, (list, tuple)):
            raw_items = task_ids
        else:
            raw_items = [task_ids]
        parsed: List[int] = []
        for item in raw_items:
            if item is None or item == "":
                continue
            parsed.append(int(item))
        return parsed or None

    def _load_configs(self, config_path, script_root_dir=".") -> List[JudgeConfig]:
        def load_script(script_obj):
            if script_obj is None:
                return None
            if type(script_obj) is str:
                return "bash", script_obj
            if "language" not in script_obj:
                language = "bash"
            else:
                language = script_obj["language"]
            if "file" in script_obj:
                with open(
                        os.path.join(script_root_dir, script_obj["file"]), encoding="utf-8"
                ) as f:
                    return language, f.read()
            elif "code" in script_obj:
                return language, script_obj["code"]
            else:
                raise ValueError("Invalid Script Object")

        # 1. handle input file:
        logging.info(f"Loading config from: {config_path}")
        if config_path.endswith(".json"):
            with open(config_path, encoding="utf-8") as f:
                config_raw = json.load(f)
            if isinstance(config_raw, list):
                pass
            elif isinstance(config_raw, dict):
                config_raw = [config_raw]
            else:
                raise ValueError("Invalid Config File")
        elif config_path.endswith(".jsonl"):
            with open(config_path, encoding="utf-8") as f:
                config_raw = [json.loads(line) for line in f.readlines()]
        else:
            raise ValueError("Invalid Config File")

        # 2. handle configs
        configs: list[JudgeConfig] = []
        for item in config_raw:
            config = JudgeConfig()
            config.description = item["description"]
            if "create" in item:
                config.image = (
                    item["create"]["local"]
                    if ("local" in item["create"])
                    else 'default'
                )
                if "init" in item["create"]:
                    if type(item["create"]["init"]) is not list:
                        config.init_script = [load_script(item["create"]["init"])]
                    else:
                        config.init_script = [
                            load_script(script_obj)
                            for script_obj in item["create"]["init"]
                        ]
                else:
                    config.init_script = []
            else:
                config.image = 'default'
            if "start" in item:
                config.start = load_script(item["start"])
            evaluation = item["evaluation"]
            if "match" in evaluation:
                if type(evaluation["match"]) is str:
                    config.match = {"answer": evaluation["match"], "strip": True}
                else:
                    config.match = evaluation["match"]
            elif "check" in evaluation:
                if type(evaluation["check"]) is not list:
                    config.check = [load_script(evaluation["check"])]
                else:
                    config.check = [
                        load_script(script_obj) for script_obj in evaluation["check"]
                    ]
            else:
                raise ValueError("check or match must exist.")
            if "check" in evaluation and "example" in evaluation:
                config.example_script = load_script(evaluation["example"])
            configs.append(config)

        logging.info(f"Loaded {len(configs)} configuration(s) from {config_path}")
        return configs

    def calculate_overall(self, results: List[TaskOutput]) -> Dict[str, Any]:
        def is_pass(config: TaskOutput) -> bool:
            if not config or not isinstance(config.result, dict):
                return False
            if "result" in config.result:
                return int(config.result.get("result", 0) == 1) == 1
            reward = config.result.get("reward", None)
            if reward is not None:
                try:
                    return float(reward) >= 1.0
                except Exception:
                    return False
            metrics = config.result.get("metrics", {})
            score = metrics.get("score", None) if isinstance(metrics, dict) else None
            if score is not None:
                try:
                    return float(score) >= 1.0
                except Exception:
                    return False
            return False

        total = sum(1 for config in results if config)
        passed = sum(1 for config in results if is_pass(config))
        overall = {
            "total": total,
            "pass": passed,
            "wrong": total - passed,
            "acc": passed / total if total else 0,
        }
        return {
            "overall": overall,
        }

    def get_indices(self) -> List[Any]:
        if self.task_ids is not None:
            missing = [idx for idx in self.task_ids if idx not in self.problem_configs]
            if missing:
                raise ValueError(
                    f"Unknown OS task id(s): {missing}. Valid range is "
                    f"0..{max(self.problem_configs.keys()) if self.problem_configs else -1}."
                )
            return list(self.task_ids)
        indices = list(self.problem_configs.keys())
        if self.shuffle_seed is not None:
            random.Random(self.shuffle_seed).shuffle(indices)
        if self.sample_size is not None:
            indices = indices[:self.sample_size]
        return indices

    @staticmethod
    def _extract_action(raw: str):
        think_pattern = r"Think:\s*(.+)"
        act_pattern = r"Act:\s*(.+)"

        think = re.findall(think_pattern, raw)
        act = re.findall(act_pattern, raw)

        ret = {"thought": "\n".join(think), "action": None, "content": None}

        # reversly iterate over the action list
        for action in act[::-1]:
            if action.lower().startswith("bash"):
                ret["action"] = "bash"
                break
            if action.lower().startswith("finish"):
                ret["action"] = "commit"
                break
            if action.lower().startswith("answer"):
                content = action[6:].strip()
                left_par_pos = content.find("(")
                right_par_pos = content.rfind(")")
                if left_par_pos == -1 or right_par_pos == -1:
                    continue
                content = content[left_par_pos + 1: right_par_pos]
                ret["action"] = "commit"
                ret["content"] = content
                break

        if ret["action"] == "bash":
            # extract from ```bash to ```
            content_pattern = r"```bash\n(.*?)\n```"
            content = re.findall(content_pattern, raw, re.DOTALL)
            content = "\n\n".join(content)
            ret["content"] = content

        return ret

    # added for function calling
    @staticmethod
    def _extract_function(func_name: str, arguments: List, thought: str):
        ret = {"thought": thought, "action": None, "content": None}
        if func_name == "bash_action":
            ret["action"] = "bash"
            ret["content"] = arguments[0]
        if func_name == "finish_action":
            ret["action"] = "commit"
            ret["content"] = arguments[0] if arguments else None
        if func_name == "answer_action":
            ret["action"] = "commit"
            ret["content"] = arguments[0]

        return ret

    async def start_sample(self, index, session: Session) -> TaskSampleExecutionResult:
        if not self.env_controller_background_task:
            self.env_controller_background_task = asyncio.create_task(self.env_controller.background_task())
            weakref.finalize(self, self.env_controller_background_task.cancel)

        logging.info(f"Starting sample with index: {index}")
        data_item = self.problem_configs[index]
        config = data_item["config"]
        file = data_item["file"]
        index_in_file = data_item["index"]

        container = Container(self.env_controller, config.image)
        try:
            logging.info("Initializing container")
            await container.initialize()
            logging.info("Container initialized successfully")

            logging.info("Starting judge process")
            result = await self._judge(session, config, container)
            result.result["file"] = file
            result.result["index_in_file"] = index_in_file
            logging.info(f"Judge process completed with status: {result.status}")
            return result
        except AgentCancelledException:
            session.inject(RewardHistoryItem(reward=0, score=0))
            return TaskSampleExecutionResult(status=SampleStatus.CANCELLED)
        except:
            logging.exception(f"Error in start_sample")
            session.inject(RewardHistoryItem(reward=0, score=0))
            return TaskSampleExecutionResult(
                status=SampleStatus.TASK_ERROR,
                result={"result": False, "error": traceback.format_exc()},
            )
        finally:
            try:
                await container.cleanup()
            except Exception as e:
                logging.error(f"Error during container cleanup: {str(e)}")

    @staticmethod
    def _persist_harness_trace(session: Session, harness_trace: Dict[str, List[Any]]) -> None:
        """Persist harness_trace via a tagged user message.

        agentrl's HTTP layer strips TaskSampleExecutionResult.result before it
        reaches the client (runs.jsonl only has reward/metrics/openai_messages/
        token_usage — verified for os/alfworld/webshop), so trace data is
        invisible unless we put it where openai_messages gets preserved.  This
        message is injected AFTER the agent loop exits so the model never
        sees it; analysis scripts can regex the tag from openai_messages.
        """
        try:
            session.inject(ChatCompletionUserMessageParam(
                role='user',
                content='[HARNESS_TRACE_V1]\n' + json.dumps(harness_trace, ensure_ascii=False),
            ))
        except Exception as _e:
            logging.warning(f"Failed to inject harness_trace audit message: {_e}")

    async def _judge(
            self, session: Session, config: JudgeConfig, container: Container
    ) -> TaskSampleExecutionResult:
        """Run the main task judgment logic."""
        logging.info("Starting execution")

        # Initialize the environment
        setup_result = await self._setup_execution_environment(config, container)
        if setup_result:
            return setup_result

        four_hook_session = None
        if self.harness_config.enabled:
            four_hook_session = FourHookSession(
                session,
                OSInteractionHarness(self.harness_config),
                self.base_tools,
                self.round_limit,
                self.harness_config,
                task_context={"description": config.description},
            )
            session = four_hook_session

        # The released policy now runs exclusively through h2/h3/h4/h5.
        harness_runtime: Optional[OSHarnessRuntime] = None
        harness_trace: Dict[str, List[Any]] = (
            four_hook_session.trace if four_hook_session else
            {"h2": [], "h3": [], "h4": [], "h5": []}
        )

        # Inject initial messages + H5 cold start
        cold_skills = []
        if harness_runtime and self.harness_config.h5_enabled:
            cold_skills = harness_runtime.cold_start_skill_hints()
            for item in cold_skills:
                harness_trace["h5"].append(item)
        tips_text = None
        if cold_skills:
            skill_lines = [f"- {item['text']}" for item in cold_skills]
            tips_text = "Some tips that may help for this task:\n" + "\n".join(skill_lines)
        self._inject_initial_messages(session, config.description, tips_text=tips_text)

        # Initialize state variables
        finish = False
        function_name = None
        call_id = None

        # Main interaction loop
        for round_num in range(self.round_limit):
            logging.info(f"Starting round {round_num + 1}/{self.round_limit}")
            round_reward = 0
            # H4 budget logic runs inside post_step_monitor after each bash;
            # no separate budget_check call at round-top.

            # Handle the agent action
            action_result = await self._handle_agent_action(
                session, container, round_num, finish, round_reward, function_name, call_id,
                harness_runtime=harness_runtime, harness_trace=harness_trace,
            )

            # Update state
            function_name = action_result.get("function_name", function_name)
            call_id = action_result.get("id", call_id)
            finish = action_result.get("finish", finish)

            # Check for errors or early termination
            if action_result.get("early_return"):
                return action_result.get("result")

            # Break if an answer has been obtained
            if "answer" in action_result:
                answer = action_result["answer"]
                break
        else:
            # Handle exhausted rounds
            logging.warning("Task round limit reached")

            # Inject reward
            final_rewardhistory = RewardHistoryItem(reward=0, score=0)
            session.inject(final_rewardhistory)

            # Persist harness_trace via openai_messages (agentrl strips result dict)
            self._persist_harness_trace(session, harness_trace)

            return TaskSampleExecutionResult(
                status=SampleStatus.TASK_LIMIT_REACHED,
                result={"result": False, "reason": "round limit", "harness_trace": harness_trace},
            )

        # Evaluate answer, with H2 answer normalization as an interface-boundary repair
        evaluation_result = await self._evaluate_answer(
            answer, config, container, session, harness_runtime=harness_runtime, harness_trace=harness_trace,
        )

        # If an evaluation error occurs
        if evaluation_result.get("error"):
            self._persist_harness_trace(session, harness_trace)
            return evaluation_result.get("result")

        # Set final reward
        jd = evaluation_result.get("success", False)
        os_score = 1 if jd else 0
        final_reward = 1 if jd else 0

        logging.info(f"Task completed {'successfully' if jd else 'unsuccessfully'}")

        # Inject final reward
        final_rewardhistory = RewardHistoryItem(reward=final_reward, score=os_score)
        session.inject(final_rewardhistory)

        # Persist harness_trace via openai_messages (agentrl strips result dict)
        self._persist_harness_trace(session, harness_trace)

        return TaskSampleExecutionResult(
            status=SampleStatus.COMPLETED, result={"result": jd, "harness_trace": harness_trace}
        )

    async def _setup_execution_environment(
            self, config: JudgeConfig, container: Container
    ) -> Optional[TaskSampleExecutionResult]:
        """Set up the execution environment and run init/start scripts."""
        # Run init scripts
        if config.init_script:
            for i, script in enumerate(config.init_script):
                logging.info(f"Running init script {i + 1}/{len(config.init_script)}")
                exit_code, _, stderr = await container.execute_independent(script)
                if exit_code != 0:
                    logging.error(f"Init script failed with exit code: {exit_code}")
                    return TaskSampleExecutionResult(
                        status=SampleStatus.UNKNOWN,
                        result={"result": False, "error": f'Init script {script} failed: {stderr}'}
                    )

        # Run start script
        if config.start:
            logging.info("Running start script")
            try:
                start = await container.execute(config.start[1])
                if start.exit_code != 0:
                    logging.error(f"Start script failed with exit code: {start.exit_code}")
                    return TaskSampleExecutionResult(
                        status=SampleStatus.UNKNOWN,
                        result={"result": False, "error": f'Start script {config.start} failed: {start}'}
                    )
            except Exception as e:
                logging.error(f"Error in start script: {str(e)}")
                return TaskSampleExecutionResult(
                    status=SampleStatus.UNKNOWN,
                    result={"result": False, "error": f'Error in start script: {str(e)}'}
                )

        logging.info("Execution setup completed successfully")
        return None

    def _inject_initial_messages(
            self,
            session: Session,
            description: str,
            tips_text: Optional[str] = None
    ) -> None:
        """Inject the system message and problem description."""
        # System message
        system_message = """You are an assistant that will act like a person. I will play the role of a Linux (Ubuntu) operating system.
Your goal is to implement the operations required by me or answer the questions proposed by me.
For each of your turns, you should first think about what you should do, and then call exactly one of the provided tools according to the situation.
If you think the output is too long, I will truncate it. The truncated output is not complete. You have to deal with the truncating problem by yourself.
Attention, your bash code should not contain any input operation. Once again, you should use one tool in each turn, and should not respond without function calling.
Note that if you think the task has been finished, or there is some message missing to completely complete the task, you should respond with calling the function "finish_action", as no additional information will be provided.
Also, note that if you have gotten the answer to the question, you should call the "answer_action" tool instead of simply writing your answer in your response.
Your answers should be exact and precise (for example, a single number), do not answer with full sentences or phrases.
Always use a tool provided instead of simply responding with content."""

        if tips_text:
            system_message = system_message + "\n\n" + tips_text

        session.inject(ChatCompletionSystemMessageParam(
            role='system',
            content=system_message
        ))
        session.inject(ChatCompletionUserMessageParam(
            role='user',
            content=f'Now, I will start a new problem in a new OS. My problem is:\n\n{description}'
        ))

    async def _handle_agent_action(
            self, session: Session, container: Container, round_num: int,
            finish: bool, round_reward: float, function_name: Optional[str], call_id: Optional[str],
            harness_runtime: Optional[OSHarnessRuntime] = None,
            harness_trace: Optional[Dict[str, List[Any]]] = None,
    ) -> dict:
        # Get the agent action
        response = await session.action()

        result = {
            "finish": finish,
            "round_reward": round_reward,
            "function_name": function_name,
            "id": call_id
        }

        # Extract tool calls
        response_content = None
        tool_calls = []
        for message in response.messages:
            if not response_content:
                response_content = message.get('content')
            tool_calls.extend(message.get('tool_calls', []) or [])

        # H2: Force-action consumption — if a previous H4 monitor set a
        # forced action, synthesise it here before any other handling so the
        # env executes the harness-chosen action this turn.
        forced_tool_call: Optional[Dict[str, Any]] = None
        if (
            harness_runtime is not None
            and self.harness_config.h2_enabled
            and harness_runtime.force_next_action is not None
        ):
            fa = harness_runtime.force_next_action
            harness_runtime.force_next_action = None
            forced_tool_call = {
                "id": f"harness_forced_{round_num}",
                "type": "function",
                "function": {
                    "name": fa["name"],
                    "arguments": json.dumps(fa.get("arguments", {})),
                },
            }
            if harness_trace is not None:
                harness_trace["h2"].append({
                    "round": round_num + 1,
                    "reason": "force_consumed",
                    "action_name": fa["name"],
                })

        # Check for valid tool calls
        if len(tool_calls) == 0 and forced_tool_call is None:
            # H2 rescue parser: attempt to lift a tool call out of plain text.
            rescued_tool_call: Optional[Dict[str, Any]] = None
            _content_has_xml_tool_call = bool(
                response_content and '<tool_call>' in response_content.lower()
            )
            if harness_runtime is not None and self.harness_config.h2_enabled and response_content:
                rescued = rescue_tool_call_from_text(response_content)
                if rescued is not None:
                    # H2 rescue-time answer normalisation: normalise answer
                    # value immediately so the submitted value is already clean.
                    if (
                        rescued["name"] == "answer_action"
                        and isinstance(rescued.get("arguments", {}).get("answer"), str)
                    ):
                        raw_ans = rescued["arguments"]["answer"]
                        norm_ans, norm_mut = harness_runtime.normalize_answer(raw_ans)
                        if norm_mut:
                            rescued["arguments"]["answer"] = norm_ans
                            if harness_trace is not None:
                                harness_trace["h2"].append({
                                    "sub": "answer_normalise",
                                    "mutated": True,
                                    "before": raw_ans,
                                    "after": norm_ans,
                                    "trigger": "rescue",
                                })
                    rescued_tool_call = {
                        "id": f"harness_rescued_{round_num}",
                        "type": "function",
                        "function": {
                            "name": rescued["name"],
                            "arguments": json.dumps(rescued.get("arguments", {})),
                        },
                    }
                    harness_runtime.note_rescue_hit()
                    if harness_trace is not None:
                        harness_trace["h2"].append({
                            "round": round_num + 1,
                            "reason": "rescued_text_embedded",
                            "action_name": rescued["name"],
                        })
            if rescued_tool_call is None:
                logging.warning("Empty tool calls array")
                if harness_runtime is not None:
                    harness_runtime.note_text_only_turn()
                # When the model wrote <tool_call> XML but it was truncated/malformed
                # so rescue failed, give specific feedback to break the loop.
                if _content_has_xml_tool_call:
                    nudge = (
                        "Harness: your response did not contain a valid tool call. "
                        "Please use the function calling API to call a tool."
                    )
                else:
                    nudge = "No tool call detected. Please call a tool."
                session.inject(ChatCompletionUserMessageParam(
                    role='user',
                    content=nudge,
                ))
                round_rewardhistory = RewardHistoryItem(reward=round_reward, score=0)
                session.inject(round_rewardhistory)
                return result
            tool_calls = [rescued_tool_call]

        # Forced action from harness takes precedence over model output
        if forced_tool_call is not None:
            tool_calls = [forced_tool_call]

        if harness_runtime is not None:
            harness_runtime.reset_text_only_streak()

        # Get the first tool call
        tool_call = tool_calls[0]
        function_name = tool_call["function"]["name"]
        logging.info(f"Processing tool call: {function_name}")
        result["function_name"] = function_name

        # Parse arguments
        try:
            arguments = tool_call["function"]["arguments"]
            arguments = json.loads(arguments)
            if not response_content and 'thought' in arguments:
                response_content = arguments['thought']
            arguments = list(arguments.values())
        except Exception as e:
            logging.error(f"Error parsing arguments: {str(e)}")
            call_id = tool_call.get("id")
            result["id"] = call_id
            session.inject(ChatCompletionToolMessageParam(
                role='tool',
                content=str(e),
                tool_call_id=call_id
            ))
            round_rewardhistory = RewardHistoryItem(reward=round_reward, score=0)
            session.inject(round_rewardhistory)
            return result

        # Extract the tool call ID and thought content
        call_id = tool_call["id"]
        result["id"] = call_id

        # Extract function
        action_data = self._extract_function(function_name, arguments, response_content)

        # Check action validity
        if "action" not in action_data:
            logging.warning("Invalid action in function extraction")
            session.inject(ChatCompletionToolMessageParam(
                role='tool',
                content="Invalid function call. Please call a tool instead",
                tool_call_id=call_id
            ))
            round_rewardhistory = RewardHistoryItem(reward=round_reward, score=0)
            session.inject(round_rewardhistory)
            return result

        if action_data["action"] not in ["bash", "commit"]:
            logging.warning(f"Unsupported action: {action_data['action']}")
            session.inject(ChatCompletionToolMessageParam(
                role='tool',
                content="Invalid function call. Please call a tool instead",
                tool_call_id=call_id
            ))
            round_rewardhistory = RewardHistoryItem(reward=round_reward, score=0)
            session.inject(round_rewardhistory)
            return result

        # Handle the valid action
        action = action_data["action"]
        content = action_data["content"]

        # H2 pre_validate: safety filter + duplicate-bash gate
        if harness_runtime is not None and self.harness_config.h2_enabled and action == "bash":
            pv = harness_runtime.pre_validate_action("bash_action", content)
            if harness_trace is not None:
                harness_trace["h2"].append({
                    "round": round_num + 1,
                    "reason": pv.get("reason", ""),
                    "blocked": pv.get("blocked", False),
                    "action_name": "bash_action",
                })
            if pv.get("blocked"):
                block_msg = (
                    "Harness blocked this command: "
                    + (pv.get("reason") or "policy_violation")
                )
                if pv.get("reason") == "duplicate_bash_force_answer":
                    block_msg = (
                        "Harness: you've run the same command repeatedly. "
                        "Submitting the detected answer via answer_action on the next turn."
                    )
                session.inject(ChatCompletionToolMessageParam(
                    role='tool',
                    content=block_msg,
                    tool_call_id=call_id,
                ))
                round_rewardhistory = RewardHistoryItem(reward=round_reward, score=0)
                session.inject(round_rewardhistory)
                return result

        # Submit the answer
        if action == "commit":
            logging.info("Received commit action with answer")
            if harness_runtime is not None:
                harness_runtime.note_answer_submitted()
            result["answer"] = content
            result["finish"] = True
        # Execute the bash command
        elif action == "bash":
            await self._execute_bash_command(
                session, container, content, call_id,
                harness_runtime=harness_runtime, harness_trace=harness_trace,
                round_num=round_num,
            )

        # Inject round reward
        round_rewardhistory = RewardHistoryItem(reward=round_reward, score=0)
        session.inject(round_rewardhistory)

        return result

    async def _execute_bash_command(
            self, session: Session, container: Container, command: str, id: str,
            harness_runtime: Optional[OSHarnessRuntime] = None,
            harness_trace: Optional[Dict[str, List[Any]]] = None,
            round_num: int = 0,
    ) -> None:
        """Execute a bash command and handle the result."""
        logging.info("Executing bash command")

        # Execute command
        result = await container.execute(command)

        # Decode output
        try:
            result_text = result.output.decode("utf-8")
        except Exception as e:
            logging.error(f"Error decoding output: {str(e)}")
            result_text = "OS Environment output cannot be decoded as UTF-8"

        # Truncate overly long output
        if len(result_text) > 800:
            logging.debug("Output truncated due to length")
            result_text = result_text[:780] + "\n[truncated because the output is too long]"

        # Inject result
        session.inject(ChatCompletionToolMessageParam(
            role='tool',
            content=f'The output of the OS:\n\n{result_text}' if result_text else "The output of the OS is empty.",
            tool_call_id=id
        ))

        # H1: update shell state with latest bash + decoded output
        if harness_runtime is not None:
            harness_runtime.update_state_after_bash(command, result_text)

        # H4 post-step monitor — recovery hint + budget warn/force + stall checks
        h4_audit_active = False
        if (
            harness_runtime is not None
            and self.harness_config.h4_enabled
        ):
            remaining = self.round_limit - round_num  # rounds remaining inclusive of this one
            h4 = harness_runtime.post_step_monitor(remaining_rounds=remaining)
            audit = h4.get("audit_reason", "")
            if harness_trace is not None:
                entry = {
                    "round": round_num + 1,
                    "audit_reason": audit,
                    "recovery_prompt": h4.get("recovery_prompt"),
                }
                if audit in ("budget_force", "budget_warn"):
                    entry["sub"] = "budget"
                harness_trace["h4"].append(entry)
            if h4.get("force_action"):
                harness_runtime.force_next_action = h4["force_action"]
            if h4.get("recovery_prompt"):
                h4_audit_active = True
                session.inject(ChatCompletionUserMessageParam(
                    role='user',
                    content=h4["recovery_prompt"],
                ))

        # H4-E: state-driven per-step guidance — pass h4_audit_active so the
        # submit hint is suppressed when H4 just emitted a recovery message
        # (prevents conflicting signals: H4 says "retry" while H4-E says "submit").
        if (
            harness_runtime is not None
            and self.harness_config.h4_enabled
        ):
            hint = harness_runtime.step_guidance(
                round_num, self.round_limit, h4_audit_active=h4_audit_active
            )
            if hint:
                session.inject(ChatCompletionUserMessageParam(
                    role='user',
                    content=hint,
                ))
                if harness_trace is not None:
                    harness_trace["h4"].append({
                        "round": round_num + 1,
                        "sub": "h4e_step_guidance",
                        "text": hint,
                        "trigger": "step_guidance",
                        "token_cost": str(len(hint.split())),
                    })

    async def _evaluate_answer(
            self, answer, config: JudgeConfig, container: Container, session: Session,
            harness_runtime: Optional[OSHarnessRuntime] = None,
            harness_trace: Optional[Dict[str, List[Any]]] = None,
    ) -> dict:
        """Evaluate the answer."""
        result = {"success": False}

        # Handle answer formatting
        if isinstance(answer, str) and config.match and config.match["strip"]:
            answer = answer.strip()

        # H2: shape-conditional answer normalisation at commit (interface-boundary repair)
        if (
            harness_runtime is not None
            and self.harness_config.h2_enabled
            and isinstance(answer, str)
        ):
            normalized, mutated = harness_runtime.normalize_answer(answer)
            if harness_trace is not None:
                harness_trace["h2"].append({
                    "sub": "answer_normalise",
                    "trigger": "commit",
                    "mutated": mutated,
                    "before": answer,
                    "after": normalized,
                })
            if mutated:
                logging.info(f"H2 normalised answer: {answer!r} -> {normalized!r}")
            answer = normalized

        logging.info(f"Final answer: {answer}")

        # Evaluate using match criteria
        if config.match:
            result["success"] = self._evaluate_by_match(answer, config)
        # Evaluate using check scripts
        elif config.check:
            result["success"] = await self._evaluate_by_check_scripts(answer, config, container)
        # No evaluation method
        else:
            logging.error("No evaluation method specified")
            final_rewardhistory = RewardHistoryItem(reward=0, score=0)
            session.inject(final_rewardhistory)
            result["error"] = True
            result["result"] = TaskSampleExecutionResult(
                status=SampleStatus.TASK_ERROR, result={"result": False}
            )

        return result

    def _evaluate_by_match(self, answer: str, config: JudgeConfig) -> bool:
        """Evaluate the answer using match criteria."""
        logging.info("Evaluating answer with match criteria")

        if "answer" in config.match:
            success = (answer == config.match["answer"])
        elif "regex" in config.match:
            success = (re.search(config.match["regex"], answer) is not None)
        else:
            success = False

        logging.info(f"Match evaluation result: {success}")
        return success

    async def _evaluate_by_check_scripts(
            self, answer: str, config: JudgeConfig, container: Container
    ) -> bool:
        """Evaluate the answer using check scripts."""
        logging.info("Evaluating answer with check scripts")
        params = [str(answer)]

        for script_index, script in enumerate(config.check):
            if script is None:
                script = config.example_script

            logging.info(f"Running check script {script_index + 1}/{len(config.check)}")
            exit_code, stdout, _ = await container.execute_independent(script, *params)
            logging.info(f"Check script output: {stdout.decode('utf-8')}")

            if exit_code != 0:
                logging.warning(f"Check script failed with exit code: {exit_code}")
                return False

            params.append(stdout.decode("utf-8"))

        logging.info("Check evaluation result: True")
        return True
