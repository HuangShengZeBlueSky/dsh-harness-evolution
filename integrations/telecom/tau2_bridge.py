"""Native DSH owns actor/tool dispatch. Tau2 supplies unchanged business state and scoring."""
import json
import os
import threading
import uuid
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from pydantic import BaseModel

from tau2.agent.llm_agent import LLMAgent
from tau2.data_model.message import AssistantMessage, ToolCall, ToolMessage, MultiToolMessage
from tau2.utils.llm_utils import to_litellm_messages
from account_facts import account_facts

URL = os.environ['DSH_BRIDGE_URL']
AGENTS = {}
SERVER = None


def rpc(path, data):
    request = urllib.request.Request(URL + path, data=json.dumps(data).encode(), headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=950) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(exc.read().decode()) from exc


def source_result_text(result):
    """Match source annotation serialization before environment loses Python types."""
    if isinstance(result, str):
        return result
    if isinstance(result, BaseModel):
        result = result.model_dump(mode='json')
    elif isinstance(result, list):
        result = [item.model_dump(mode='json') if isinstance(item, BaseModel) else item for item in result]
    return json.dumps(result, ensure_ascii=False, default=str)


class Executor(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            agent = AGENTS[data['executor_id']]
            if self.path == '/account-facts':
                value = account_facts(agent, data)
            elif self.path in ('/harness', '/prepare'):
                raise ValueError('Policy RPC removed: native DSH plugins must make all rule decisions')
            else:
                # JavaScript numbers lose the wire distinction between 2 and 2.0.
                # Restore Python's original JSON numeric type when the native call
                # has not semantically changed the arguments.
                if data.get('arguments_json') is not None:
                    original_args = json.loads(data['arguments_json'])
                    if original_args == data['call']['arguments']:
                        data['call']['arguments'] = original_args
                agent.faithful_arguments[data['call']['id']] = data['call']['arguments']
                agent.source_serialized_content = None
                message = agent.environment_response(ToolCall(**data['call']))
                agent.raw_results[data['call']['id']] = message
                agent.harness_results[data['call']['id']] = message
                value = message.model_dump(mode='json')
                value['source_serialized_content'] = (agent.source_serialized_content
                    if agent.source_serialized_content is not None else message.content)
            body = json.dumps(value).encode()
            self.send_response(200)
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(exc)}).encode())

    def log_message(self, *_args):
        pass


def start_executor():
    global SERVER
    if SERVER is None:
        SERVER = ThreadingHTTPServer(('127.0.0.1', 0), Executor)
        threading.Thread(target=SERVER.serve_forever, daemon=True).start()
    return 'http://127.0.0.1:' + str(SERVER.server_port) + '/execute'


class GridAgent(LLMAgent):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_id = None
        self.executor_id = str(uuid.uuid4())
        self.raw_results = {}
        self.harness_results = {}
        self.faithful_arguments = {}
        self.native_dispatches = {}
        self.native_skipped_calls = {}
        self.environment_response = None
        source = os.environ.get('DSH_WIRE_TOOLS')
        self.wire_tools = json.loads(Path(source).read_text()) if source else [t.openai_schema for t in self.tools]
        AGENTS[self.executor_id] = self

    def get_init_state(self, message_history=None):
        state = super().get_init_state(message_history)
        self.session_id = rpc('/open', {
            'system_prompt': self.system_prompt, 'domain_policy': self.domain_policy,
            'tools': self.wire_tools, 'history': to_litellm_messages(state.messages),
            'seed': self.llm_args.get('seed'), 'executor_url': start_executor(),
            'executor_id': self.executor_id,
        })['session_id']
        return state

    def _generate_next_message(self, message, state):
        incoming = message.tool_messages if isinstance(message, MultiToolMessage) else [message]
        state.messages.extend(incoming)
        result = rpc('/advance', {
            'session_id': self.session_id,
            'input': to_litellm_messages(incoming),
            'incoming': [item.model_dump(mode='json') for item in incoming],
            'latest_event': '\n'.join(str(item) for item in incoming),
            'expected': {'messages': to_litellm_messages(state.system_messages + state.messages), 'tools': self.wire_tools},
        })
        raw = result['response']
        # Native history retains co-emitted text and all internal invalid calls; Tau2
        # sees the same text OR deferred-business-call projection as Pydantic did.
        message = result['external_message']
        usage = result.get('usage') or raw.get('usage', {})
        return AssistantMessage(
            role='assistant', content=message.get('content'),
            timestamp=datetime.fromtimestamp(result['external_timestamp_epoch']).isoformat(),
            tool_calls=[ToolCall(id=t['id'], name=t['function']['name'], arguments=json.loads(t['function']['arguments'])) for t in message.get('tool_calls') or []] or None,
            usage={'prompt_tokens': usage.get('prompt_tokens', 0), 'completion_tokens': usage.get('completion_tokens', 0)},
            raw_data={'response': raw, 'native_internal_retries': result['internal_retries'], 'timestamp_clock': 'tau2-local-naive'},
        )

    def get_tool_response(self, call):
        response = rpc('/result', {'session_id': self.session_id, 'call_id': call.id})
        self.native_dispatches[call.id] = {'call': call.model_dump(mode='json'), 'business': response['business'], 'native_content': response['content'], 'error': response['error']}
        if response['business']:
            raw = self.raw_results.pop(call.id)
            # The original learned Tau2 result processors changed the ToolMessage itself.
            # Memory's next newest-event and the actor must both see those exact annotations.
            return raw.model_copy(update={'content': response['content'], 'error': raw.error})
        self.native_skipped_calls[call.id] = {'name': call.name, 'reason': response['content'], 'error': response['error']}
        return ToolMessage(id=call.id, role='tool', requestor='assistant', content=response['content'], error=response['error'])

    def close(self):
        if self.session_id:
            rpc('/close', {'session_id': self.session_id})
            self.session_id = None
        AGENTS.pop(self.executor_id, None)


def bind_environment(orchestrator):
    agent = orchestrator.agent
    agent.business_environment = orchestrator.environment
    original = orchestrator.environment.get_response
    agent.environment_response = original
    original_make_tool_call = orchestrator.environment.make_tool_call

    def capture_raw_result(tool_name, requestor='assistant', **kwargs):
        result = original_make_tool_call(tool_name, requestor=requestor, **kwargs)
        if requestor == 'assistant':
            agent.source_serialized_content = source_result_text(result)
        return result

    orchestrator.environment.make_tool_call = capture_raw_result

    def dispatch(call):
        return original(call) if call.requestor != 'assistant' else agent.get_tool_response(call)

    orchestrator.environment.get_response = dispatch


def factory(tools, domain_policy, **kwargs):
    return GridAgent(tools=tools, domain_policy=domain_policy, llm=kwargs['llm'], llm_args=kwargs.get('llm_args'))
