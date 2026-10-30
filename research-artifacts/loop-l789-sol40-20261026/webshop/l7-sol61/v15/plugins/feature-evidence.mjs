export const name = 'feature-evidence';
const norm = s => s.toLowerCase().replace(/\buhd\b/g,'ultra hd').replace(/[^a-z0-9]+/g,' ').trim();
const features = ['ultra hd','high performance','dark circles','cruelty free'];
export function apply(ctx) {
  ctx.on('benchmark/setup',async(payload,next) => {
    await next();
    const {ac,audit,getRawBusinessResult} = payload;
    let task = '', product = '', title = '', onProduct = false;
    const viewed = new Set();
    ac.on('tools/post-execute',async(call,result,next) => {
      const decision = await next();
      if (decision.kind !== 'accept') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const value = (args.value || '').toLowerCase();
      if (call.name === 'search_action' || value === 'back to search') product = '';
      else if (/^b0[a-z0-9]{8}$/i.test(value)) product = value;
      else if (product && ['features','description'].includes(value)) viewed.add(product);
      const page = typeof raw.content === 'string' ? raw.content : (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const instruction = page.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/i);
      if (instruction) task = norm(instruction[1]);
      const chunks = page.split('Available Actions:')[0].split('[SEP]').map(s => s.trim());
      const price = chunks.findIndex(s => /^Price:/i.test(s));
      onProduct = price > 0 && chunks.some(s => /^Buy Now$/i.test(s));
      title = onProduct ? norm(chunks[price-1]) : '';
      return decision;
    });
    ac.on('tools/pre-execute',async(call,next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'click_action' || !product || !onProduct || viewed.has(product)) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (args.value.toLowerCase() !== 'buy now') return decision;
      const missing = features.filter(f => (` ${task} `).includes(` ${f} `) && !(` ${title} `).includes(` ${f} `));
      if (!missing.length) return decision;
      const reason = `Before buying, inspect this product's public Features or Description for the requested properties ${JSON.stringify(missing)}; the current title does not explicitly establish them. Click features or description, read the evidence, then < prev to return to the product and complete the requested variant selections before buy now. Preserve the requested product type, other requirements and budget. If the details do not support the request, inspect another product. This is an evidence check, not a claim that the properties are absent. Call a tool.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
