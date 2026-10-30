export const name = 'required-options';
const norm = s => s.toLowerCase().replace(/\bfluid\s+ounces?\b/g,'fl oz').replace(/\bounces?\b/g,'oz').replace(/[^a-z0-9.]+/g,' ').trim();
const readDimensions = s => [...s.toLowerCase().matchAll(/\b\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?){1,2}\s*(?:feet|foot|ft|inches|inch|in|cm|mm)\b/g)].map(m => m[0].replace(/\s+/g,'').replace(/×/g,'x').replace(/(?:feet|foot)$/,'ft').replace(/(?:inches|inch)$/,'in'));
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, getRawBusinessResult} = payload;
    let groups = [], selected = new Set(), task = '', wantedDimensions = [];
    const matches = (group, value) => {
      const core = norm(value.split('(')[0]);
      if (!core) return false;
      if (core.length < 3) return (` ${task} `).includes(` ${norm(group)} ${core} `) || (group.includes('size') && (` ${task} `).includes(` size ${core} `));
      return (` ${task} `).includes(` ${core} `);
    };
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const value = (args.value || '').toLowerCase();
      if (call.name === 'search_action' || /^b0[a-z0-9]{8}$/i.test(value)) selected = new Set();
      else for (const group of groups) if (group.values.includes(value)) selected.add(group.name);
      const page = typeof raw.content === 'string' ? raw.content : (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const instruction = page.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/i);
      if (instruction) {
        task = norm(instruction[1].replace(/(?:,?\s*(?:and\s+)?price\s+(?:lower|less)\s+than)[\s\S]*/i,''));
        wantedDimensions = readDimensions(instruction[1]);
      }
      groups = [];
      const legal = page.match(/['"]clickables['"]\s*:\s*(\[[\s\S]*\])\s*\}/);
      if (!legal) return decision;
      const allowed = [...legal[1].matchAll(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)].map(m => m[0].slice(1,-1).replace(/\\(['"\\])/g,'$1').toLowerCase());
      if (!allowed.includes('buy now')) return decision;
      const chunks = page.split('Available Actions:')[0].split('[SEP]').map(s => s.trim().toLowerCase());
      const start = chunks.indexOf('< prev') + 1, end = chunks.findIndex(s => s.startsWith('price:')) - 1;
      let group = null;
      for (const chunk of chunks.slice(start,end)) {
        if (!allowed.includes(chunk)) { group = {name:chunk,values:[]}; groups.push(group); }
        else if (group) group.values.push(chunk);
      }
      return decision;
    });
    ac.on('tools/pre-execute', async (call, next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'click_action') return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (args.value.toLowerCase() !== 'buy now') return decision;
      if (wantedDimensions.length === 1) {
        const wanted = wantedDimensions[0], unit = wanted.match(/[a-z]+$/)[0];
        const available = groups.filter(g => /size|dimension/.test(g.name)).flatMap(g => g.values.flatMap(readDimensions)).filter(d => d.endsWith(unit));
        if (available.length && !available.includes(wanted)) {
          const reason = `The instruction requires dimensions ${wanted}; this product's size menu only offers ${JSON.stringify(available)}. A nearby size is not the requested size. Use < prev to inspect another product and its size options, or back to search for the exact dimensions. Keep the other requested features and budget. Call a tool.`;
          audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
          return {kind:'deny',reason};
        }
      }
      const pending = groups.filter(g => !selected.has(g.name)).map(g => ({group:g.name,values:g.values.filter(v => matches(g.name,v)).sort((a,b) => norm(b.split('(')[0]).length - norm(a.split('(')[0]).length || a.length - b.length)})).filter(g => g.values.length);
      if (!pending.length) return decision;
      const reason = `Before buying, explicitly select the remaining task-requested option groups: ${JSON.stringify(pending.map(g => ({group:g.group,matching_values:g.values.slice(0,3)})))}. These groups have no confirmed option click on this product. Click the best exact matching available value, then buy now after all requested groups are selected. Call a tool.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
