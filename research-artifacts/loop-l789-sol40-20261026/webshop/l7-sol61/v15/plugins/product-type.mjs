export const name = 'product-type';
const rules = [
  {request:/\bdress(?:es)?\b/i, expected:'dress', valid:/\b(?:dress(?:es)?|sundress(?:es)?)\b/i, wrong:/\b(?:shorts|pants|trousers|jeans)\b/i},
  {request:/\btruffles?\b/i, expected:'truffles', valid:/\btruffles?\b/i, wrong:/\bbars?\b/i},
  {request:/\bfortune\s+cookies?\b/i, expected:'fortune cookies', valid:/\bfortune\s+cookies?\b/i, wrong:/\b(?:glitter|powder|dust)\b/i},
  {request:/\bcr[eê]pes?\b/i, expected:'crepes', valid:/\bcr[eê]pes?\b/i, wrong:/\b(?:waffles?|wafels?)\b/i},
];
export function apply(ctx) {
  ctx.on('benchmark/setup',async(payload,next) => {
    await next();
    const {ac,audit,getRawBusinessResult} = payload;
    let task = '', title = '';
    ac.on('tools/post-execute',async(call,result,next) => {
      const decision = await next();
      if (decision.kind !== 'accept') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      const page = typeof raw.content === 'string' ? raw.content : (raw.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const instruction = page.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/i);
      if (instruction) task = instruction[1];
      const chunks = page.split('Available Actions:')[0].split('[SEP]').map(s => s.trim());
      const price = chunks.findIndex(s => /^Price:/i.test(s));
      title = price > 0 && chunks.some(s => /^Buy Now$/i.test(s)) ? chunks[price-1] : '';
      return decision;
    });
    ac.on('tools/pre-execute',async(call,next) => {
      const decision = await next();
      if (decision.kind !== 'allow' || call.name !== 'click_action' || !title) return decision;
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      if (args.value.toLowerCase() !== 'buy now') return decision;
      const conflict = rules.find(r => r.request.test(task) && !r.valid.test(title) && r.wrong.test(title));
      if (!conflict) return decision;
      const reason = `The requested product type is ${conflict.expected}, but the current product is "${title}". This is a different product type; matching a flavor, color, occasion or pack count does not resolve that conflict. Use < prev to inspect a product of the requested type and its selectable variants, or back to search with that main type. Keep all other requirements and budget. Call a tool.`;
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
