/** Native strategy runtime: DSH owns checks, result processing and recovery; Tau2 owns business state. */
import {createServer} from 'node:http';
import {mkdirSync, appendFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {LlmAdapter, createUserMessage, createAssistantMessage, createSystemMessage, createToolResultMessage, isAgentLoopRequest} from '@deepseek-ai/dsh-llm';
import {SessionId} from '@deepseek-ai/dsh-session';
import {scopeOf, scopeTarget} from '@deepseek-ai/dsh-scope';
export const name = 'telecom-native-plugins-bridge';
export const inject = ['llm', 'agents', 'sessions', 'tools', 'systemPrompt'];
const textContent = m => m.content.filter(b => b.type === 'text').map(b => b.text).join('');
function project(messages) {
  return messages.map(m => {
    const content = textContent(m);
    if (m.role === 'tool') return {role: 'tool', content, tool_call_id: m.source.callId};
    if (m.role === 'assistant') {
      const calls = m.content.filter(b => b.type === 'tool-call').map(b => ({id: b.id, type: 'function', function: {name: b.name, arguments: b.arguments}}));
      return {role: 'assistant', content: content || null, ...(calls.length ? {tool_calls: calls} : {})};
    }
    return {role: m.role, content};
  });
}
// Protocol recovery belongs to the native runtime; this does not impose field/type policy.
export function prepareCalls(calls, names) {
  const available = [...names].sort();
  return {calls: calls.map(call => {
    const name = call.function.name;
    const item = {id:call.id, name};
    if (!available.includes(name)) {
      const quoted = value => "'" + value.replaceAll("'", "\\'") + "'";
      return {...item, reason:'unknown_tool', feedback:`Unknown tool name: ${quoted(name)}. Available tools: ${available.map(quoted).join(', ')}\n\nFix the errors and try again.`};
    }
    try { if (typeof call.function.arguments === 'string') JSON.parse(call.function.arguments); }
    catch (error) { return {...item, reason:'arguments_json', feedback:`Invalid JSON tool arguments: ${error.message}\n\nFix the errors and try again.`}; }
    return item;
  })};
}
export function apply(ctx, config) {
  const states = new Map();
  mkdirSync(config.logRoot, {recursive: true});
  const log = (s, file, value) => appendFileSync(join(config.logRoot, s.id, file), JSON.stringify(value) + '\n');
  async function executor(s, route, body, signal) {
    const r = await fetch(new URL(route, s.executorUrl), {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({executor_id: s.executorId, ...body}), signal});
    log(s, 'executor-routes.jsonl', {at:Date.now(), step:s.step, route, status:r.status});
    if (!r.ok) throw Error(`Telecom ${route} HTTP ${r.status}: ${await r.text()}`);
    return r.json();
  }
  async function provider(s, body, signal, auxiliary) {
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(config.endpoint + '/chat/completions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]) : AbortSignal.timeout(config.timeoutMs)});
        if (!r.ok) throw Error('Model HTTP ' + r.status);
        const response = await r.json();
        for (const key of ['prompt_tokens', 'completion_tokens']) s.turnUsage[key] += response.usage?.[key] || 0;
        return response;
      } catch (e) {
        log(s, 'transport.jsonl', {at: Date.now(), step: s.step, auxiliary, attempt, error: e.message});
        if (attempt >= config.maxRetries || signal?.aborted) throw e;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  async function awaitInput(s, signal) {
    if (s.ready) return;
    await new Promise((resolve, reject) => {
      const abort = () => { s.awaitAdvance = null; reject(Error('Session closed while waiting for external input')); };
      s.awaitAdvance = () => { signal?.removeEventListener('abort', abort); resolve(); };
      signal?.addEventListener('abort', abort, {once: true});
      if (signal?.aborted) abort();
    });
  }
  function finishExternal(s, external) {
    if (!s.waiter) return;
    const done = s.waiter;
    s.waiter = null;
    s.ready = false;
    log(s, 'external-projection.jsonl', {step: s.step, response: external, internal_retries: s.retryCount});
    done.resolve({session_id: s.id, response: s.raw, external_message: external, external_timestamp_epoch: s.externalTimestampEpoch, internal_retries: s.retryCount, usage: s.turnUsage});
  }
  class Adapter extends LlmAdapter {
    async *stream(options) {
      const s = states.get(options.sessionId);
      if (!s?.ready) throw Error('External input was not admitted before native prompt assembly');
      const fixed = isAgentLoopRequest(options) && options.temperature === config.temperature && options.maxTokens === config.maxTokens;
      if (!fixed) throw Error('FIXED_MODEL_PARAMETERS_CHANGED');
      const messages = project(options.messages);
      const tools = options.tools.map(t => {
        const original = s.wireTools.find(x => x.function.name === t.name);
        return {...original, type: 'function', function: {...original?.function, name: t.name, description: t.description, parameters: t.parameters}};
      });
      const body = {model: config.model, messages, tools, tool_choice: 'auto', temperature: config.temperature, max_tokens: config.maxTokens, seed: s.seed};
      const requestIndex = ++s.requestIndex;
      log(s, 'parity.jsonl', {step: s.step, request_index: requestIndex, internal_retry: s.retryCount, fixed_parameters: fixed, baseline_equal: isDeepStrictEqual({messages, tools}, s.expected)});
      log(s, 'plugin-diff.jsonl', {step: s.step, original: s.expected, effective: {messages, tools}, methods: config.methods.map(x => x.id)});
      log(s, 'requests.jsonl', {at: Date.now(), step: s.step, request_index: requestIndex, body});
      let response = await provider(s, body, options.signal, false);
      for (let attempt = 0; attempt <= 2; attempt++) {
        const verdict = await s.ac.waterfall(scopeTarget(s.handle.agent, scopeOf(s.ac)), 'telecom/review-response',
          {message: response.choices[0].message, attempt}, () => Promise.resolve({notes: []}));
        if (!verdict.notes?.length) break;
        log(s, 'response-review.jsonl', {step:s.step, attempt, notes:verdict.notes, rejected_message:response.choices[0].message, exhausted:attempt===2});
        if (attempt === 2) break;
        const correction = {role:'system', content:'Runtime plugin correction based on visible evidence. Revise the previous proposed response before it is sent. '+verdict.notes.join(' ')};
        const repairBody = {...body, messages:[...body.messages, {role:'assistant',content:response.choices[0].message.content||''}, correction]};
        const repairIndex=++s.requestIndex;
        log(s,'requests.jsonl',{at:Date.now(),step:s.step,request_index:repairIndex,response_repair:attempt+1,body:repairBody});
        response=await provider(s,repairBody,options.signal,false);
        log(s,'responses.jsonl',{at:Date.now(),step:s.step,request_index:repairIndex,response_repair:attempt+1,response});
      }
      // Capture the actor message time before native tools can execute. Tau2 sorts
      // messages by this timestamp when replaying the business environment.
      s.externalTimestampEpoch = Date.now() / 1000;
      log(s, 'responses.jsonl', {at: Date.now(), step: s.step, request_index: requestIndex, response});
      s.raw = response;
      const m = response.choices[0].message;
      const calls = m.tool_calls || [];
      for (const call of calls) s.argumentsJson.set(call.id, call.function.arguments);
      const prepared = prepareCalls(calls, tools.map(t => t.function.name));
      for (const call of prepared.calls) {
        if (call.feedback !== undefined) {
          s.feedback.set(call.id, call.feedback);
          s.retryCount++;
          log(s, 'internal-recovery.jsonl', {at: Date.now(), step: s.step, request_index: requestIndex, call_id: call.id, tool: call.name, reason: call.reason, feedback: call.feedback, retry: s.retryCount});
        }
      }
      const toolRetryLimit = config.originalToolRetryLimit ?? config.maxRetries;
      if (s.retryCount > toolRetryLimit) throw Error(`Exceeded maximum retries (${toolRetryLimit}) for tool recovery`);
      // Wait for native dispatch before projecting calls: a business call may be
      // denied by a selected validator. Local skills and denied calls remain
      // inside this external turn, without consuming unknown-tool retry budget.
      s.batch = calls.length ? calls : null;
      s.external = calls.length ? null : {content: m.content || '', tool_calls: null};
      const blocks = [];
      if (m.content) blocks.push({type: 'text', text: m.content});
      for (const t of calls) blocks.push({type: 'tool-call', id: t.id, name: t.function.name, arguments: t.function.arguments});
      for (let index = 0; index < blocks.length; index++) {
        const block = blocks[index];
        yield {type: 'block-start', index, blockType: block.type};
        if (block.type === 'text') yield {type: 'text-delta', index, text: block.text};
        else yield {type: 'tool-call-delta', index, id: block.id, name: block.name, argumentsDelta: block.arguments};
        yield {type: 'block-end', index, block};
      }
      if (response.usage) yield {type: 'usage', usage: {inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens}};
      yield {type: 'finish', reason: {kind: calls.length ? 'tool-calls' : response.choices[0].finish_reason === 'length' ? 'max-tokens' : 'stop'}};
    }
  }
  ctx.llm.registerAdapter(['tau2-h0'], new Adapter());
  ctx.on('session/event', (session, event) => {
    const s = states.get(session.id);
    if (!s) return;
    log(s, 'session.jsonl', event);
    if (event.type === 'tool/result') {
      const m = event.data.message;
      const result = {content: textContent(m), error: !!m.isError, business: s.business.has(m.source.callId)};
      s.toolResults.set(m.source.callId, result);
      const done = s.toolWaiters.get(m.source.callId);
      if (done) { s.toolWaiters.delete(m.source.callId); done(result); }
      if (s.executorFailure && s.waiter) {
        s.waiter.reject(s.executorFailure); s.waiter = null; s.ready = false;
      } else if (s.batch?.every(call => s.toolResults.has(call.id))) {
        const calls = s.batch;
        s.batch = null;
        const business = calls.filter(call => s.business.has(call.id) || s.denials.get(call.id)?.origin === 'source-tau2-validator');
        const local = calls.filter(call => !s.business.has(call.id));
        if (local.length) log(s, 'local-tool-rounds.jsonl', {step: s.step, request_index: s.requestIndex,
          local_internal_no_aux_update: true, unknown_retries: s.retryCount,
          calls: local.map(call => ({id: call.id, name: call.function.name,
            reason: s.feedback.has(call.id) ? 'model-retry-feedback' : s.denials.has(call.id) ? 'selected-validator-denied' : 'native-local-tool',
            result: s.toolResults.get(call.id)}))});
        if (business.length) finishExternal(s, {content: null, tool_calls: business});
      }
    }
    if (event.type === 'assistant/message' && s.waiter && s.external) {
      finishExternal(s, s.external);
    }
    if (event.type === 'turn/end' && s.waiter) {
      const done = s.waiter; s.waiter = null;
      done.reject(Error('Native turn ended without an external result: ' + JSON.stringify(event.data)));
    }
  });
  async function open(body) {
    body = {...body, tools: config.faithfulTools || body.tools};
    const id = 'aligned-' + randomUUID();
    const s = {id, seed: body.seed, executorUrl: body.executor_url, executorId: body.executor_id, wireTools: body.tools,
      step: 0, requestIndex: 0, ready: false, retryCount: 0, external: null, expected: null, waiter: null, awaitAdvance: null, turnUsage: {prompt_tokens: 0, completion_tokens: 0},
      currentInput: [], incoming: [], latestEvent: '', batch: null, executorFailure: null, denials: new Map(), rawBusiness: new Map(), argumentsJson: new Map(), feedback: new Map(), business: new Set(), toolResults: new Map(), toolWaiters: new Map()};
    states.set(id, s); mkdirSync(join(config.logRoot, id));
    s.handle = await ctx.agents.create({sessionId: SessionId(id), meta: {cwd: config.workspace}, agentOptions: {provider: 'tau2-h0', model: config.model, maxTokens: config.maxTokens}, setup: async (ac, agent) => {
      s.ac = ac;
      agent.session.append('turn/start', {turn: 1});
      agent.session.append('step/start', {turn: 1, step: 1});
      agent.session.append('system/message', {turn: 1, step: 1, message: createSystemMessage(body.system_prompt)}, {surfaceOp: 'append'});
      for (const m of body.history || []) {
        const content = [];
        if (m.content) content.push({type: 'text', text: m.content});
        for (const t of m.tool_calls || []) content.push({type: 'tool-call', id: t.id, name: t.function.name, arguments: t.function.arguments});
        if (m.role === 'assistant') agent.session.append('assistant/message', {turn: 1, step: 1, stream: [], message: createAssistantMessage({content, source: {provider: 'tau2-h0', model: config.model}})}, {surfaceOp: 'append'});
        else if (m.role === 'user') agent.session.append('user/message', createUserMessage({content, source: {kind: 'user'}}), {surfaceOp: 'append'});
        else if (m.role === 'tool') agent.session.append('tool/result', {turn: 1, step: 1, message: createToolResultMessage({content, callId: m.tool_call_id, isError: !!m.error})}, {surfaceOp: 'append'});
      }
      agent.session.append('step/end', {turn: 1, step: 1});
      agent.session.append('turn/end', {turn: 1, reason: {kind: 'completed'}});
      ac.systemPrompt.section({name: 'tau2-h0', order: 0, text: body.system_prompt, complete: false, interpolate: false});
      ac.on('agent/request', async (_payload, next) => ({...await next(), temperature: config.temperature}));
      // This middleware is registered before plugins. DSH assembles BEFORE agent/pre-step.
      // Waiting in Adapter.stream or pre-step would expose one-turn-stale memory.
      ac.on('system-prompt/assemble', async (_assembly, context, next) => {
        await awaitInput(s, context.signal);
        const assembly = await next();
        const position = name => { const i = body.tools.findIndex(t => t.function.name === name); return i < 0 ? body.tools.length : i; };
        assembly.tools.sort((a, b) => position(a.name) - position(b.name));
        return assembly;
      });
      ac.on('agent/error', ({error}) => { if (s.waiter) { s.waiter.reject(error); s.waiter = null; } });
      for (const t of body.tools) ac.tools.register({...t.function, output: {schema: {type: 'string'}, render: (_args, value) => [{type: 'text', text: value}]}, execute: async (args, exec) => {
        let raw;
        try { raw = await executor(s, '/execute', {call: {id: exec.callId, name: exec.name, arguments: args, requestor: 'assistant'}, arguments_json: s.argumentsJson.get(exec.callId)}, exec.signal); }
        catch (error) { s.executorFailure = error; throw error; }
        s.business.add(exec.callId); s.rawBusiness.set(exec.callId, raw);
        log(s, 'business-dispatch.jsonl', {call_id: exec.callId, name: exec.name, args, arguments_json: s.argumentsJson.get(exec.callId), error: !!raw.error, content: raw.content});
        return raw.content;
      }});
      // ExternalToolset uses any_schema, so business field/type errors belong to Tau2.
      // Only unknown names or malformed JSON become internal model-retry feedback.
      ac.on('tools/pre-execute', async (exec, next) => s.feedback.has(exec.callId) ? {kind: 'deny', reason: s.feedback.get(exec.callId)} : await next());
      ac.on('tools/execute', async (exec, next) => {
        const result = await next(); const raw = s.rawBusiness.get(exec.callId);
        return raw?.error ? {content: [{type: 'text', text: raw.content}], isError: true, error: {message: raw.content}} : result;
      });
      ac.on('tools/post-execute', async (exec, result, next) => {
        const decision = await next();
        const content = s.feedback.get(exec.callId);
        if (content !== undefined) return {kind: 'accept', content: [{type: 'text', text: content}]};
        return decision;
      });
      const audit = value => {
        if (value.hook === 'tools/pre-execute' && value.decision === 'deny') {
          const method = config.methods.find(m => m.id === value.method_id);
          s.denials.set(value.call_id, {method_id: value.method_id, implementation: method?.implementation, surface: method?.surface,
            origin: method?.implementation === 'native-source-validation' ? 'source-tau2-validator' : method?.implementation === 'legacy-tau2_validators' ? 'tau2-validator' : method?.implementation === 'legacy-pydantic_validators' ? 'pydantic-validator' : 'native-plugin'});
        }
        log(s, 'activations.jsonl', {at: Date.now(), step: s.step, ...value});
      };
      const auxiliaryLLM = async options => {
        const request_id = randomUUID();
        const legacyBody = {messages: options.messages, ...(options.response_format ? {response_format: options.response_format} : {})};
        const request = {model: config.model, temperature: config.temperature, max_tokens: config.maxTokens, seed: s.seed, ...(options.body || legacyBody)};
        if (request.model !== config.model || request.temperature !== config.temperature || request.max_tokens !== config.maxTokens || request.seed !== s.seed) throw Error('Auxiliary fixed parameters changed');
        log(s, 'auxiliary.jsonl', {at: Date.now(), step: s.step, request_id, purpose: options.purpose, method_id: options.method_id, kind: 'request', body: request});
        const response = await provider(s, request, options.signal, true);
        log(s, 'auxiliary.jsonl', {at: Date.now(), step: s.step, request_id, purpose: options.purpose, method_id: options.method_id, kind: 'response', response});
        return {response, message: response.choices[0].message, usage: response.usage, request_id};
      };
      const factCache = new Map();
      const getAccountFacts = async operation => {
        const key = operation.call_id + ':' + operation.phase;
        if (!factCache.has(key)) factCache.set(key, executor(s, '/account-facts', operation).then(result => {
          log(s, 'account-facts.jsonl', {step:s.step, operation,
            facts_source:'Tau2 account records; policy evaluated only by DSH JavaScript', result});
          return result;
        }));
        return factCache.get(key);
      };
      const harnessDomain = async () => { throw Error('Python strategy RPC removed in native runtime'); };
      await ctx.waterfall('telecom/setup', {ac, agent, body, audit, auxiliaryLLM, harnessDomain, getAccountFacts,
        getVisibleInput: () => ({step: s.step, messages: s.currentInput, incoming: s.incoming, latest_event: s.latestEvent}),
        getRawBusinessResult: callId => s.rawBusiness.get(callId),
        getPreExecutionDenial: callId => s.denials.get(callId)}, () => Promise.resolve());
    }});
    writeFileSync(join(config.logRoot, id, 'session.jsonl'), s.handle.agent.session.snapshotEvents().map(e => JSON.stringify(e)).join('\n') + '\n');
    writeFileSync(join(config.logRoot, id, 'identity.json'), JSON.stringify({id, seed: body.seed, model: config.model, temperature: config.temperature, maxTokens: config.maxTokens, historyOrigin: 'tau2-task-initial-state'}));
    return {session_id: id};
  }
  async function advance(body) {
    const s = states.get(body.session_id);
    if (!s) throw Error('Unknown session');
    if (s.waiter || s.ready) throw Error('Concurrent external advance');
    s.step++; s.retryCount = 0; s.external = null; s.turnUsage = {prompt_tokens: 0, completion_tokens: 0};
    s.currentInput = body.input; s.incoming = body.incoming; s.latestEvent = body.latest_event; s.expected = body.expected;
    const result = new Promise((resolve, reject) => { s.waiter = {resolve, reject}; });
    try {
      await s.ac.waterfall(scopeTarget(s.handle.agent, scopeOf(s.ac)), 'telecom/advance-input', {sequence: s.step, incoming: body.incoming, latest_event: body.latest_event}, () => Promise.resolve());
      s.ready = true;
      if (s.awaitAdvance) { const resume = s.awaitAdvance; s.awaitAdvance = null; resume(); }
      for (const m of body.input) {
        if (m.role === 'user') s.handle.agent.followup(createUserMessage({content: [{type: 'text', text: m.content}], source: {kind: 'user'}}));
        else if (m.role !== 'tool') throw Error('Unsupported input role');
      }
    } catch (error) { s.waiter = null; throw error; }
    return result;
  }
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/health') { res.end(JSON.stringify({ok: true, sessions: states.size, loop: 'native-dsh-aligned'})); return; }
      let raw = ''; for await (const part of req) raw += part;
      const body = JSON.parse(raw); let value;
      if (req.url === '/open') value = await open(body);
      else if (req.url === '/advance') value = await advance(body);
      else if (req.url === '/result') {
        const s = states.get(body.session_id);
        value = s.toolResults.has(body.call_id) ? s.toolResults.get(body.call_id) : await new Promise(resolve => s.toolWaiters.set(body.call_id, resolve));
      } else if (req.url === '/close') {
        const s = states.get(body.session_id);
        if (s) { if (s.waiter) { s.waiter.reject(Error('Closed')); s.waiter = null; } await s.handle.dispose(); states.delete(s.id); }
        value = {ok: true};
      } else throw Error('Unknown endpoint');
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value));
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({error: error.message})); }
  });
  server.listen(config.port, '127.0.0.1');
  ctx.on('dispose', async () => { for (const s of states.values()) await s.handle.dispose(); await new Promise(resolve => server.close(resolve)); });
}
