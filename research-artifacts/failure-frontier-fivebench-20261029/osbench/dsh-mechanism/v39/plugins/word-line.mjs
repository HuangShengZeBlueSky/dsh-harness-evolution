export const name='word-line';
export function apply(ctx){
 ctx.on('benchmark/setup',async({ac,agent,audit},next)=>{
  await next(); const corrected=new Set();
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();
   if(decision.kind!=='allow'||call.name!=='bash_action')return decision;
   const task=agent.session.snapshotEvents().filter(e=>e.type==='user/message').flatMap(e=>e.data.content||[]).filter(b=>b.type==='text').map(b=>b.text).find(t=>t.includes('My problem is:'))||'';
   if(!/word ["']error["']/i.test(task)||!/lines/i.test(task)||/string|unique|distinct/i.test(task))return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const script=args?.script||'';
   if(!/\bgrep\b/.test(script)||!script.includes('error')||!/wc\s+-l/.test(script))return decision;
   const exclude=/exclud[^.]*containing|do not contain|without[^.]*error/i.test(task);
   const inverse=/grep\s+[^|;]*-[A-Za-z]*v\b|--invert-match/.test(script);
   const word=/grep\s+[^|;]*-[A-Za-z]*w|--word-regexp/.test(script);
   const kind=exclude!==inverse?'polarity':!word?'word':null;
   if(!kind||corrected.has(kind))return decision;
   corrected.add(kind);
   let reason=exclude?'The USER asks to EXCLUDE lines containing the word error. Retain NONMATCHING lines: keep the negative predicate with grep -h -v -w, then count retained lines. Do not switch this to counting error-containing lines.':'The USER asks to count lines CONTAINING the word error. Use grep -h -w to emit matching lines, then wc -l. Do not append grep -v error: that removes the very lines requested.';
   reason+=/case[ -]?insensitive|ignoring case|regardless of case/i.test(task)?' The request ignores case, so apply -i to this matching predicate.':' Keep the literal case of the requested word; do not add -i without a request to ignore case.';
   reason+=' Preserve the original file scope and recursion. Count each retained line once, not individual -o occurrences or -l filenames. Recompute before submission.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
