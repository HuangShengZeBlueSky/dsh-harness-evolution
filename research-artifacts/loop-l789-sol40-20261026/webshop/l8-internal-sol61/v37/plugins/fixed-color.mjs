export const name='fixed-color';
export function apply(ctx){ctx.on('benchmark/setup',async(payload,next)=>{
 await next();const {ac,audit,getRawBusinessResult}=payload;let conflict=null,corrected=false;
 const colors=s=>[...new Set((String(s).toLowerCase().match(/\b(?:black|white|blue|pink|red|green|purple|yellow|orange|grey|gray|brown|beige|ivory|silver|gold)\b/g)||[]).map(x=>x==='grey'?'gray':x))];
 ac.on('tools/post-execute',async(call,result,next)=>{
  const d=await next();if(d.kind!=='accept')return d;
  const raw=getRawBusinessResult(call.callId);if(!raw||raw.error)return d;
  conflict=null;const p=String(raw.content).split('Available Actions:')[0].split('[SEP]').map(x=>x.trim()),price=p.findIndex(x=>/^Price:/.test(x)),prev=p.indexOf('< Prev');
  if(price<0||prev<0||price-prev!==2||!p.includes('Buy Now'))return d;
  const task=p[1]||'';if(!/\b(?:bed frames?|office chair|desk chair|wall lamp|sconces?|chandelier)\b/i.test(task))return d;
  const wanted=colors(task),actual=colors(p[price-1]);
  if(wanted.length===1&&actual.length===1&&wanted[0]!==actual[0])conflict={task,wanted:wanted[0],actual:actual[0],title:p[price-1]};
  return d;
 });
 ac.on('tools/pre-execute',async(call,next)=>{
  const d=await next();if(d.kind!=='allow'||corrected||!conflict||call.name!=='click_action'||String(call.arguments?.value).toLowerCase()!=='buy now')return d;
  corrected=true;const reason=`This fixed furniture/light product has no option groups and its title explicitly says ${conflict.actual}, while the instruction requires ${conflict.wanted}. Do not buy this color mismatch. Return to results or search another product. Keep the complete request: ${conflict.task}. A new product must satisfy the required type, color, features and budget together; do not choose an unrelated item only because its color matches.`;
  audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
