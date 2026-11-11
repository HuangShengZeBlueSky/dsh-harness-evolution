import { create as createMemory } from './scale-memory.mjs';
import { create as createAction } from './scale-action.mjs';
import { create as createReceipt } from './scale-receipt.mjs';
export const name = 'scale-slot';

export function apply(ctx, config) {
  const setup = async (payload, next) => {
    await next();
    const { ac, audit } = payload;
    const memory = config.mode === 'B' ? createMemory() : {};
    const action = config.mode === 'B' ? createAction() : {};
    const receipt = config.mode === 'B' ? createReceipt() : {};
    ac.on('system-prompt/assemble', async (assembly, context, onward) => {
      const result = await onward();
      const text = [config.skill, memory.guide?.()].filter(Boolean).join('\n');
      if (!text) return result;
      audit({ method_id: name, hook: 'system-prompt/assemble', text });
      return { ...result, sections: [...result.sections, { name, order: 90, text, interpolate: false }] };
    });
    if (action.check) ac.on('tools/pre-execute', async (call, onward) => {
      const result = await onward();
      if (result.kind !== 'allow') return result;
      const reason = action.check(structuredClone(call));
      if (typeof reason !== 'string' || !reason.trim()) return result;
      audit({ method_id: name, hook: 'tools/pre-execute', decision: 'deny', call_id: call.callId, reason });
      return { kind: 'deny', reason };
    });
    if (memory.observe || receipt.explain) ac.on('tools/post-execute', async (call, result, onward) => {
      const decision = await onward();
      if (decision.kind !== 'accept') return decision;
      const raw = payload.getRawBusinessResult?.(call.callId);
      memory.observe?.(structuredClone(call), structuredClone(raw));
      const annotation = receipt.explain?.(structuredClone(call), structuredClone(raw));
      if (typeof annotation !== 'string' || !annotation.trim()) return decision;
      audit({ method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation });
      return { ...decision, content: [...(decision.content || result.content), {type:'text', text:annotation}] };
    });
  };
  ctx.on('benchmark/setup', setup);
  ctx.on('telecom/setup', setup);
}
