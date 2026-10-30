export const name = 'actual-submit';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac, agent, audit}, next) => {
    await next();
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const events = agent.session.snapshotEvents();
      let lastMissing = -1, lastCall = -1;
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        const message = e.type === 'user/message' ? e.data : e.type === 'assistant/message' ? e.data.message : null;
        if (!message) continue;
        if (e.type === 'assistant/message' && message.content.some(b => b.type === 'tool-call')) lastCall = i;
        if (e.type === 'user/message' && message.content.some(b => b.type === 'text' && /No tool call detected|did not contain a valid tool call/.test(b.text))) lastMissing = i;
      }
      if (lastMissing < 0 || lastMissing < lastCall) return result;
      const text = 'The latest environment feedback says your previous text did NOT invoke a tool. The task is still unsubmitted. If you have already obtained the answer, invoke the registered answer_action function now through the function-calling API; do not print its name or JSON in normal text and do not repeat a finished calculation. If more computation is needed, invoke bash_action as a real function call. Only an actual submission tool result confirms completion.';
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result, tools:result.tools.map(t => t.name === 'answer_action'
        ? {...t,description:t.description+' Call this registered function to submit the obtained answer now. A printed tool name or JSON does not submit.'} : t),
        sections:[...result.sections,{name,order:30,text,interpolate:false}]};
    });
  });
}
