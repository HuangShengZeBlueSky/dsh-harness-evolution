export const name = 'visible-step-coach';
const textOf = message => typeof message?.content === 'string' ? message.content : (message?.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const { ac, agent, audit, getRawBusinessResult, getVisibleInput } = payload;
    let task = '', light = false, object = null, destinationType = null;
    let process = null, appliance = null, count = 1, needsSlice = false;
    let observation = '', held = null, lastSuggestedAction = null, location = null, destination = null, lastCall = null;
    const checked = new Set(), known = new Map(), processed = new Set(), delivered = new Set(), sliced = new Set();
    function initialize() {
      if (object) return true;
      const messages = getVisibleInput().messages || [];
      const sessionUsers = agent.session.snapshotEvents().filter(e => e.type === 'user/message').map(e => e.data);
      const initial = [...messages, ...sessionUsers].map(textOf).find(s => s.includes('Your task is to:')) || '';
      task = initial.match(/Your task is to:\s*([^.]*)/)?.[1]?.toLowerCase() || '';
      light = /^(look at|examine)/.test(task);
      needsSlice = /\bsliced\b/.test(task);
      const objectTask = task.replace(/\bsliced /g, '');
      object = light ? objectTask.match(/^(?:look at|examine) (?:the )?(\w+)/)?.[1] : objectTask.match(/^(?:heat|cool|clean) some (\w+)/)?.[1] || objectTask.match(/^(?:find two|put two|put a|put some) (?:(?:hot|cool|clean) )?(\w+)/)?.[1];
      if (!object) return false;
      destinationType = light ? 'desklamp' : task.match(/(?:in|on) (\w+)$/)?.[1];
      process = /\b(hot|heat)\b/.test(task) ? 'heat' : /\b(cool)\b/.test(task) ? 'cool' : /\b(clean)\b/.test(task) ? 'clean' : null;
      appliance = { heat: 'microwave', cool: 'fridge', clean: 'sinkbasin' }[process];
      count = /\btwo\b/.test(task) ? 2 : 1;
      update(initial);
      return true;
    }
    function update(raw) {
      observation = raw;
      const feedback = raw.split(' AVAILABLE ACTIONS:')[0];
      const on = feedback.match(/(?:On the|The) (\w+ \d+)(?:, you see| is (?:closed|open))/) || feedback.match(/You open the (\w+ \d+)/);
      if (on) location = on[1];
      if (location && (/you see/.test(feedback) || /You open the/.test(feedback))) checked.add(location);
      const pick = feedback.match(/You pick up the (\w+ \d+) from the (\w+ \d+)/);
      if (pick) { held = pick[1]; known.delete(held); delivered.delete(held); }
      if (/You are not carrying anything/.test(feedback)) held = null;
      const slice = feedback.match(/You sliced? (?:the )?(\w+ \d+) (?:using|with)/);
      if (slice) sliced.add(slice[1]);
      const done = feedback.match(/You (heat|cool|clean) the (\w+ \d+) using the/);
      if (done && done[1] === process) processed.add(done[2]);
      const put = feedback.match(/You put the (\w+ \d+) in\/on the (\w+ \d+)/);
      if (put) {
        held = null;
        known.set(put[1], put[2]);
        if (put[1].split(' ')[0] === object && put[2].split(' ')[0] === destinationType && (!process || processed.has(put[1])) && (!needsSlice || sliced.has(put[1]))) {
          if (!destination) destination = put[2];
          if (destination === put[2]) delivered.add(put[1]);
        }
      }
      for (const action of actions()) {
        const take = action.match(/^take (\w+ \d+) from (\w+ \d+)$/);
        if (take) known.set(take[1], take[2]);
        const lamp = action.match(/^use (desklamp \d+)$/);
        if (lamp && location) known.set(lamp[1], location);
      }
    }
    function actions() { return (observation.split(' AVAILABLE ACTIONS:')[1] || '').trim().split('\n').filter(Boolean); }
    function suggestion() {
      const choices = actions();
      const exactType = item => item?.split(' ')[0] === object;
      const go = place => choices.find(a => a === `go to ${place}`);
      const targetTake = choices.find(a => {const m=a.match(/^take (\w+ \d+) from /); return m && exactType(m[1]) && (!needsSlice || sliced.has(m[1])) && !delivered.has(m[1]);});
      let action, reason;
      if (needsSlice && sliced.size === 0) {
        if (held?.startsWith('knife ')) {
          action = choices.find(a => a.startsWith(`slice ${object} `) && a.endsWith(` with ${held}`));
          if (!action) {
            const target = [...known].find(([item]) => exactType(item));
            if (target) action = go(target[1]);
          }
          reason = `Hold the knife and find the ${object} on a surface. Use the listed slice action before taking or processing the target.`;
        } else if (held) {
          action = choices.find(a => a.startsWith(`put ${held} in/on `));
          reason = `Put ${held} down to free your hand for a knife. The target must be sliced before final processing and delivery.`;
        } else {
          action = choices.find(a => /^take knife \d+ from /.test(a));
          if (!action) {
            const knife = [...known].find(([item]) => item.startsWith('knife '));
            if (knife) action = go(knife[1]);
          }
          reason = `This task requires sliced ${object}. First find and take a knife, carry it to the visible ${object}, and use an available slice action. Then put the knife down, take that sliced object, ${process || 'process'} it and deliver it.`;
        }
      } else if (held && exactType(held)) {
        if (process && !processed.has(held)) {
          action = choices.find(a => a.startsWith(`${process} ${held} with ${appliance} `)) || choices.find(a => a.startsWith(`go to ${appliance} `));
          reason = `The required ${process} action has not been confirmed for ${held}; take it to ${appliance} and execute the explicit processing action.`;
        } else if (light) {
          action = choices.find(a => /^use desklamp \d+$/.test(a));
          if (!action) {
            const lamp = [...known].find(([item]) => item.startsWith('desklamp '));
            if (lamp) action = go(lamp[1]);
          }
          reason = `Keep holding ${held}; find the desklamp and use it while holding this object.`;
        } else {
          action = choices.find(a => a.startsWith(`put ${held} in/on ${destination || destinationType + ' '}`));
          if (!action) action = choices.find(a => a.startsWith(`open ${destination || destinationType + ' '}`));
          if (!action) action = destination ? go(destination) : choices.find(a => a.startsWith(`go to ${destinationType} `));
          reason = `Deliver ${held} to ${destination || destinationType}; ${delivered.size}/${count} distinct target objects delivered with confirmed requirements.`;
        }
      } else if (held) {
        action = choices.find(a => a.startsWith(`put ${held} in/on `));
        reason = `Actually holding ${held}, which is not the required type ${object}. Put it down to free your hand.`;
      } else if (targetTake) {
        action = targetTake;
        reason = `The exact target is available here. Pick it up before leaving; seeing it does not mean carrying it.`;
      } else {
        const target = [...known].find(([item]) => exactType(item) && (!needsSlice || sliced.has(item)) && !delivered.has(item));
        if (target) { action = go(target[1]); reason = `A requested object was visibly found at ${target[1]}; return to take it.`; }
      }
      if (!action) {
        action = choices.find(a => a.startsWith('open '));
        if (!action) {
          const food = ['apple', 'bread', 'egg', 'lettuce', 'potato', 'tomato', 'mug', 'cup', 'winebottle', 'glassbottle'];
          const affinity = {
            pillow: ['bed', 'sofa', 'armchair'], laptop: ['desk', 'bed', 'sofa'],
            handtowel: ['handtowelholder'], towel: ['towelholder'], toiletpaper: ['toiletpaperhanger', 'toilet'],
            pan: ['stoveburner', 'countertop'], pot: ['stoveburner', 'countertop']
          }[object] || [];
          const priority = place => {
            const type = place.split(' ')[0];
            if (affinity.includes(type)) return 0;
            if (type === 'fridge' && food.includes(object)) return 1;
            if (!['cabinet', 'drawer', 'fridge', 'microwave', 'safe', 'box'].includes(type)) return 2;
            return 3;
          };
          action = choices.filter(a => a.startsWith('go to ') && !checked.has(a.slice(6)))
            .sort((a, b) => priority(a.slice(6)) - priority(b.slice(6)) || a.localeCompare(b, 'en', { numeric: true }))[0];
        }
        reason = reason || 'Search an uninspected location. Prefer relevant open surfaces and the fridge before spending many moves opening cabinets and drawers. Open a closed container when inspecting it.';
      }
      if (needsSlice) reason = `Required slicing confirmed for: ${[...sliced].join(', ') || 'none'}. ${reason || ''}`;
      lastSuggestedAction = action || null;
      return `Visible-state reminder: original task: ${task}. Actually holding: ${held || 'nothing confirmed'}. Confirmed ${process || 'processing'}: ${[...processed].join(', ') || 'none'}. Delivered distinct targets: ${[...delivered].join(', ') || 'none'}. ${reason || ''}${action ? ` Recommended next tool call: take_action(${JSON.stringify({action})}). This action is copied from the latest AVAILABLE ACTIONS.` : ''} Trust the actual feedback, not the intended command. Continue using the tool while the episode remains active.`;
    }
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      if (!initialize()) return result;
      const text = suggestion();
      audit({ method_id: name, hook: 'system-prompt/assemble', call_id: lastCall, text });
      return { ...result, sections: [...result.sections, { name, order: 30, text, interpolate: false }] };
    });
    let pickupCorrections = 0;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'take_action' || !initialize() || pickupCorrections >= 2) return decision;
      const requested = call.arguments.action || '';
      if (light && held?.split(' ')[0] === object && (requested === `examine ${held}` || /^go to desklamp(?: \d+)?$/.test(requested))) {
        const guidance = suggestion();
        if (lastSuggestedAction && lastSuggestedAction !== requested) {
          pickupCorrections++;
          const reason = `You already hold ${held}. Examining it alone does not complete the lamp task, and the lamp is an object on furniture rather than a navigation destination. Keep holding it and call take_action(${JSON.stringify({action: lastSuggestedAction})}) to find or use the lamp. ${guidance}`;
          audit({method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason});
          return {kind: 'deny', reason};
        }
      }
      if (held) return decision;
      const requestedPlace = requested.startsWith('go to ') ? requested.slice(6) : null;
      const knownTarget = [...known].some(([item]) => item.split(' ')[0] === object && !delivered.has(item));
      if (requestedPlace && checked.has(requestedPlace) && !knownTarget) {
        const guidance = suggestion();
        const alternative = lastSuggestedAction;
        const newSearch = alternative && (alternative.startsWith('open ') || (alternative.startsWith('go to ') && !checked.has(alternative.slice(6))));
        if (newSearch && alternative !== requested) {
          pickupCorrections++;
          const reason = `${requestedPlace} has already been inspected without finding the remaining target. An uninspected location is still available. Continue with take_action(${JSON.stringify({action: alternative})}) instead of repeating this search. ${guidance}`;
          audit({method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason});
          return {kind: 'deny', reason};
        }
      }
      const operatedType = requested.match(/^(?:take|put|heat|cool|clean) (\w+) \d+/)?.[1];
      if (operatedType && operatedType !== object && !/\bsliced\b/.test(task)) {
        pickupCorrections++;
        const reason = `The original task requires the exact type ${object}; ${operatedType} is a different object and cannot satisfy it. You are empty-handed, so do not invent its placement. ${suggestion()}`;
        audit({method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason});
        return {kind: 'deny', reason};
      }
      const targetTake = actions().find(action => {
        const match = action.match(/^take (\w+ \d+) from /);
        return match && match[1].split(' ')[0] === object && (!needsSlice || sliced.has(match[1])) && !delivered.has(match[1]);
      });
      if (!targetTake || !/^(go to |use |heat |cool |clean |put )/.test(requested)) return decision;
      pickupCorrections++;
      const reason = `You are empty-handed. The required object is available here, so first call take_action(${JSON.stringify({action: targetTake})}). You must actually take it before moving, processing it or using a lamp. This skipped pickup has not been executed.`;
      audit({method_id: name, hook: 'tools/pre-execute', call_id: call.callId, decision: 'deny', reason});
      return {kind: 'deny', reason};
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept' || call.name !== 'take_action' || !initialize()) return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      lastCall = call.callId;
      update(raw.content);
      const annotation = suggestion();
      audit({ method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation });
      return { ...decision, content: [...(decision.content || result.content), { type: 'text', text: annotation }] };
    });
  });
}
