export const name = 'execution-receipt-gate';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit,getRawBusinessResult}, next) => {
    await next();
    let pending = false;
    let blocked = false;
    const guidance = 'Execution receipt state: the last bash proposal was DENIED and has not run. A corrected script is a plan, not output evidence. Execute the corrected command with bash_action and observe its actual tool result before submitting an answer.';
    ac.on('tools/pre-execute', async (call, proceed) => {
      const decision = await proceed();
      if (call.name === 'bash_action' && decision.kind === 'deny') {
        pending = true;
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'observed-denial'});
        return decision;
      }
      if (decision.kind !== 'allow' || !pending || blocked || !['answer_action','finish_action'].includes(call.name)) return decision;
      blocked = true;
      const reason = guidance + ' Call bash_action now; numbers inside a suggested command are not the computed answer.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
    ac.on('tools/post-execute', async (call, result, proceed) => {
      const decision = await proceed();
      if (call.name === 'bash_action' && getRawBusinessResult(call.callId)) pending = false;
      return decision;
    });
    ac.on('system-prompt/assemble', async (assembly, context, proceed) => {
      const result = await proceed();
      if (!pending) return result;
      audit({method_id:name,hook:'system-prompt/assemble',text:guidance});
      return {...result,sections:[...result.sections,{name,order:30,text:guidance,interpolate:false}]};
    });
  });
}
