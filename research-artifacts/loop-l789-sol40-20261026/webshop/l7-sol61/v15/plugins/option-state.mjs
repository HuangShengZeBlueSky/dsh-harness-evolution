export const name = 'option-state';
const text = content => (content || []).filter(x => x.type === 'text').map(x => x.text).join('\n');
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, getRawBusinessResult} = payload;
    let page = '', selected = [], options = [];
    const guidance = () => options.length ? `PRODUCT OPTIONS CHECK: The title is not a selection. Explicitly click every option required by the instruction before buy now. Match size, color, flavor, length, quantity and style, even if the title already mentions them. Only use available values. If a required option is absent, use < prev to inspect another product instead of substituting. Confirmed option clicks on this product: ${JSON.stringify(selected)}. Available option values: ${JSON.stringify(options)}.` : '';
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const value = args?.value?.toLowerCase();
      if (call.name === 'search_action' || /^b0[a-z0-9]{8}$/i.test(value || '') || value === '< prev' || value === 'back to search') selected = [];
      else if (options.includes(value) && !selected.includes(value)) selected.push(value);
      page = typeof raw.content === 'string' ? raw.content : text(raw.content);
      const chunks = page.split('Available Actions:')[0].split('[SEP]').map(x => x.trim().toLowerCase());
      const actionText = page.split('Available Actions:')[1] || '';
      options = [];
      if (chunks.includes('buy now')) {
        const price = chunks.findIndex(x => x.startsWith('price:'));
        const prev = chunks.indexOf('< prev');
        if (price > prev + 2) options = chunks.slice(prev + 1, price - 1).filter(x => !['color','size','style','flavor name','scent','pattern name','configuration','item package quantity','number of items'].includes(x));
      }
      const annotation = guidance();
      if (!annotation) return decision;
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content || result.content),{type:'text',text:annotation}]};
    });
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next(); const note = guidance();
      if (!note) return result;
      audit({method_id:name,hook:'system-prompt/assemble',text:note});
      return {...result,sections:[...result.sections,{name,order:25,text:note,interpolate:false}]};
    });
  });
}
