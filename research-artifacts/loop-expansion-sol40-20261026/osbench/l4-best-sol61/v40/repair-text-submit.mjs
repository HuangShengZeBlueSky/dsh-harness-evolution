export const name = 'repair-text-submit';

function answerArguments(text) {
  const marker = /(?:^|\n)\s*-?answer_action\b\s*(?:\n|:)?/i.exec(text);
  if (!marker) return null;
  const tail = text.slice(marker.index + marker[0].length).trim().replace(/^\(\s*/, '');
  if (!tail) return null;
  if (tail.startsWith('{')) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < tail.length; i++) {
      const c = tail[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const value = JSON.parse(tail.slice(0, i + 1));
          return typeof value.answer === 'string' ? JSON.stringify({answer:value.answer}) : null;
        } catch { return null; }
      }
    }
    return null;
  }
  const scalar = tail.split(/\r?\n/, 1)[0].trim();
  return /^[+-]?[\w./:+-]+$/.test(scalar) ? JSON.stringify({answer:scalar}) : null;
}

export function apply(ctx) {
  let sequence = 0;
  const audits = new Map();
  ctx.on('benchmark/setup', async (payload, next) => {
    const result = await next();
    audits.set(String(payload.agent.session.id), payload.audit);
    let hasResult = false;
    payload.ac.on('tools/post-execute', async (call, toolResult, proceed) => {
      const decision = await proceed();
      if (decision.kind === 'accept' && call.name === 'bash_action' && !toolResult.isError) hasResult = true;
      return decision;
    });
    payload.ac.on('system-prompt/assemble', async (assembly, context, proceed) => {
      const assembled = await proceed();
      if (!hasResult) return assembled;
      const text = 'Submit the exact result with an actual answer_action function call; ordinary text naming the function does not submit the task.';
      payload.audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...assembled,sections:[...assembled.sections,{name,order:25,text,interpolate:false}]};
    });
    return result;
  });
  ctx.on('llm/stream', (options, next) => (async function* () {
    const chunks = [];
    for await (const chunk of next()) chunks.push(chunk);
    if (chunks.some(chunk => chunk.type === 'block-start' && chunk.blockType === 'tool-call')) {
      yield* chunks;
      return;
    }
    const text = chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('');
    const args = answerArguments(text);
    if (!args) {
      yield* chunks;
      return;
    }
    const id = `text-submit-${++sequence}`;
    audits.get(String(options.sessionId))?.({method_id:name,hook:'llm/stream',decision:'convert-explicit-answer-marker',text:text.slice(-240)});
    yield {type:'block-start',index:0,blockType:'tool-call'};
    yield {type:'tool-call-delta',index:0,id,name:'answer_action',argumentsDelta:args};
    yield {type:'block-end',index:0,block:{type:'tool-call',id,name:'answer_action',arguments:args}};
    for (const chunk of chunks) if (chunk.type === 'usage') yield chunk;
    yield {type:'finish',reason:{kind:'tool-calls'}};
  })());
}
