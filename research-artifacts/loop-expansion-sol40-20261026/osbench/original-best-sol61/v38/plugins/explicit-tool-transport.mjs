export const name = 'explicit-tool-transport';
function parseExplicit(text) {
  try {return JSON.parse(text);} catch {}
  let quoted=false;
  let normalized='';
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') {quoted=!quoted;normalized+=c;continue;}
    if (quoted && c==='\\' && i+1<text.length) {
      const next=text[++i];
      normalized += /["\\/bfnrtu]/.test(next) ? '\\'+next : '\\\\'+next;
    } else normalized+=c;
  }
  return JSON.parse(normalized);
}
export function apply(ctx) {
  let sequence = 0;
  const states = new Map();
  ctx.on('benchmark/setup', async ({ac,agent,audit,getRawBusinessResult}, next) => {
    await next();
    const state = {audit,calls:new Set()};
    states.set(String(agent.session.id),state);
    ac.on('tools/post-execute', async (call,result,proceed) => {
      const decision = await proceed();
      if (decision.kind !== 'accept' || !state.calls.has(call.callId) || !getRawBusinessResult(call.callId)) return decision;
      state.calls.delete(call.callId);
      const annotation = '\nThe explicit tool_call request was executed through the actual ' + call.name + ' tool. The receipt above is the real execution result; continue from it rather than repeating the textual request.';
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
  ctx.on('llm/stream',(options,next)=>(async function*(){
    const chunks=[];
    for await (const chunk of next()) chunks.push(chunk);
    if (chunks.some(chunk=>chunk.type==='block-start' && chunk.blockType==='tool-call')) {yield* chunks;return;}
    const text=chunks.filter(chunk=>chunk.type==='text-delta').map(chunk=>chunk.text).join('');
    const tags=[...text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)];
    const state=states.get(String(options.sessionId));
    if (!state || tags.length!==1) {yield* chunks;return;}
    let call,args;
    try {call=parseExplicit(tags[0][1]);args=typeof call.arguments==='string'?parseExplicit(call.arguments):call.arguments;} catch {yield* chunks;return;}
    const key={bash_action:'script',answer_action:'answer',finish_action:'thought'}[call.name];
    if (!key || typeof args?.[key]!=='string') {yield* chunks;return;}
    const id='explicit-tool-'+(++sequence);
    const encoded=JSON.stringify(args);
    state.calls.add(id);
    state.audit({method_id:name,hook:'llm/stream',decision:'convert-explicit-tool-call',call_id:id,name:call.name,arguments:args});
    yield {type:'block-start',index:0,blockType:'tool-call'};
    yield {type:'tool-call-delta',index:0,id,name:call.name,argumentsDelta:encoded};
    yield {type:'block-end',index:0,block:{type:'tool-call',id,name:call.name,arguments:encoded}};
    for (const chunk of chunks) if (chunk.type==='usage') yield chunk;
    yield {type:'finish',reason:{kind:'tool-calls'}};
  })());
}
