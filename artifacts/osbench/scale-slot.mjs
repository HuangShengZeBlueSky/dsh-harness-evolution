import { create } from './scale-composition.mjs';

export const name = 'scale-slot';

export function apply(ctx, config) {
  const setup = async (payload, next) => {
    await next();
    const { ac, audit } = payload;
    const state = {};
    const mechanisms = create(state);
    ac.on('system-prompt/assemble', async (assembly, context, onward) => {
      const result = await onward();
      const guidance = mechanisms.map(m => m.guide?.()).filter(Boolean);
      const text = [config.skill, ...guidance].filter(Boolean).join('\n');
      if (!text) return result;
      audit({ method_id: name, hook: 'system-prompt/assemble', text });
      return { ...result, sections: [...result.sections, { name, order: 90, text, interpolate: false }] };
    });
    if (mechanisms.some(m => m.check)) ac.on('tools/pre-execute', async (call, onward) => {
      const result = await onward();
      if (result.kind !== 'allow') return result;
      for (const mechanism of mechanisms) {
        const reason = mechanism.check?.(structuredClone(call));
        if (typeof reason === 'string' && reason.trim()) {
          audit({ method_id: name, hook: 'tools/pre-execute', decision: 'deny', call_id: call.callId, reason,
                  mechanism: mechanism.id });
          return { kind: 'deny', reason };
        }
      }
      return result;
    });
    if (mechanisms.some(m => m.observe || m.explain)) ac.on('tools/post-execute', async (call, result, onward) => {
      const decision = await onward();
      if (decision.kind !== 'accept') return decision;
      const raw = payload.getRawBusinessResult?.(call.callId);
      for (const mechanism of mechanisms) mechanism.observe?.(structuredClone(call), structuredClone(raw));
      const annotations = mechanisms.map(m => m.explain?.(structuredClone(call), structuredClone(raw))).filter(
        message => typeof message === 'string' && message.trim());
      if (!annotations.length) return decision;
      const annotation = annotations.join('\n');
      audit({ method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation });
      return { ...decision, content: [...(decision.content || result.content), { type: 'text', text: annotation }] };
    });
  };
  ctx.on('benchmark/setup', setup);
  ctx.on('telecom/setup', setup);
}
