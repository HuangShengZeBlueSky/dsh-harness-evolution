export const name = 'action-hint';
const textOf = blocks => (blocks || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, getVisibleInput, getRawBusinessResult} = payload;
    let goal = '', target = '', destination = '', mode = '', lamp = '', held = '', location = '';
    let actions = [], chosenDestination = '';
    const searched = new Set(), known = new Map(), processed = new Set(), placed = new Set();
    function observe(text) {
      const parts = text.split('AVAILABLE ACTIONS:');
      const receipt = parts[0];
      if (parts[1]) actions = parts[1].trim().split('\n').map(x => x.trim()).filter(Boolean);
      const where = receipt.match(/(?:On the|The|You open the|You close the) (\w+ \d+)/);
      if (where) location = where[1];
      if (location && /you see|In it, you see/i.test(receipt)) searched.add(location);
      for (const a of actions) {
        const t = a.match(/^take (\w+ \d+) from (\w+ \d+)$/);
        if (t) known.set(t[1], t[2]);
      }
      for (const l of receipt.matchAll(/\b((?:desklamp|floorlamp) \d+)\b/g)) if (location) known.set(l[1], location);
      const take = receipt.match(/You pick up the (\w+ \d+) from the (\w+ \d+)/);
      if (take) { held = take[1]; known.delete(held); }
      const process = receipt.match(/You (clean|cool|heat) the (\w+ \d+) /);
      if (process) processed.add(process[1] + ':' + process[2]);
      const put = receipt.match(/You put the (\w+ \d+) in\/on the (\w+ \d+)/);
      if (put) {
        held = ''; known.set(put[1], put[2]);
        if (put[1].split(' ')[0] === target && put[2].split(' ')[0] === destination && (!mode || processed.has(mode + ':' + put[1]))) {
          placed.add(put[1]); chosenDestination = put[2];
        }
      }
      if (/You are not carrying anything/.test(receipt)) held = '';
    }
    function initialize() {
      for (const m of getVisibleInput().messages) {
        if (!goal && m.role === 'user') {
          const t = String(m.content).match(/Your task is to:\s*(.*?)(?:AVAILABLE ACTIONS:|$)/s);
          if (!t) continue;
          goal = t[1].trim().toLowerCase().replace(/\.$/, '');
          const object = goal.match(/(?:look at|examine)\s+(?:(?:a|an|some|the)\s+)?(\w+)/) || goal.match(/\b(?:some|a|an|two)\s+(?:(?:clean|hot|cool|cold|heated)\s+)?(\w+)/);
          target = object?.[1] || '';
          destination = goal.match(/\b(?:in|on)\s+(?:the\s+)?(\w+)$/)?.[1] || '';
          mode = /\bclean\b/.test(goal) ? 'clean' : /\b(cool|cold)\b/.test(goal) ? 'cool' : /\b(heat|hot|heated)\b/.test(goal) ? 'heat' : '';
          lamp = goal.match(/\b(desklamp|floorlamp)\b/)?.[1] || '';
          observe(String(m.content));
        }
      }
    }
    function recommend() {
      const find = p => actions.find(p);
      const go = place => find(a => a === 'go to ' + place);
      const targetHeld = held && held.split(' ')[0] === target;
      if (held && !targetHeld) return find(a => a.startsWith('put ' + held + ' in/on '));
      if (targetHeld) {
        if (mode && !processed.has(mode + ':' + held)) {
          const appliance = {clean:'sinkbasin',cool:'fridge',heat:'microwave'}[mode];
          return find(a => a.startsWith(mode + ' ' + held + ' with ')) || find(a => a.startsWith('go to ' + appliance + ' '));
        }
        if (lamp) {
          const use = find(a => a.startsWith('use ' + lamp + ' '));
          if (use) return use;
          for (const [obj, site] of known) if (obj.startsWith(lamp + ' ') && go(site)) return go(site);
        } else if (destination) {
          const put = find(a => a.startsWith('put ' + held + ' in/on ' + (chosenDestination || destination + ' ')));
          if (put) return put;
          const open = find(a => a.startsWith('open ' + (chosenDestination || destination + ' ')));
          if (open) return open;
          return chosenDestination ? go(chosenDestination) : find(a => a.startsWith('go to ' + destination + ' '));
        }
      } else if (target) {
        const take = find(a => {const t = a.match(/^take (\w+ \d+) from /); return t && t[1].split(' ')[0] === target && !placed.has(t[1]);});
        if (take) return take;
        for (const [obj, site] of known) if (obj.split(' ')[0] === target && !placed.has(obj) && go(site)) return go(site);
      }
      const unsearched = actions.filter(a => a.startsWith('go to ') && !searched.has(a.slice(6)));
      unsearched.sort((a, b) => Number(/^go to (cabinet|drawer) /.test(a)) - Number(/^go to (cabinet|drawer) /.test(b)));
      return find(a => a.startsWith('open ')) || unsearched[0];
    }
    function guidance() {
      const action = recommend();
      return `Visible-state reminder: goal=${goal}; exact target=${target || 'unknown'}; holding=${held || 'nothing confirmed'}; processed=${[...processed].join(', ') || 'none confirmed'}; correctly placed=${[...placed].join(', ') || 'none confirmed'}.\n${action ? 'Recommended next available action: ' + action + '. Call take_action with this exact action string.' : 'Choose a current available action that advances an unmet goal requirement.'}\nTrust actual environment receipts, not the intended effect of an unlisted action. Do not announce completion while requirements remain unmet.`;
    }
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next(); initialize();
      const text = guidance(); audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:30,text,interpolate:false}]};
    });
    let recoveries = 0;
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || recoveries >= 4 || call.name !== 'take_action') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const action = args.action;
      const recovery = recommend();
      const skippedPickup = !held && recovery?.startsWith('take ' + target + ' ') && action !== recovery;
      const emptyLamp = lamp && String(action).startsWith('use ' + lamp + ' ') && held.split(' ')[0] !== target;
      if (recovery && (!actions.includes(action) || skippedPickup || emptyLamp)) {
        recoveries++;
        const reason = `Action not executed. Goal requires ${target}; currently holding ${held || 'nothing'}. Next call take_action with action exactly: ${recovery}. This recovery uses one action from the fixed budget.`;
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
        return {kind:'deny',reason};
      }
      return decision;
    });
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept') return decision;
      const raw = getRawBusinessResult(call.callId);
      observe(typeof raw?.content === 'string' ? raw.content : textOf(result.content));
      const annotation = guidance(); audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
  });
}
