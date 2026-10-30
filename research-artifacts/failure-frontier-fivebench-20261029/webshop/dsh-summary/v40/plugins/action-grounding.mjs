export const name = 'action-grounding';
export function apply(ctx) {
 ctx.on('benchmark/setup', async (payload,next) => {
  await next();
  const {ac,audit,getRawBusinessResult}=payload;
  let choices=[],denied=0;
  ac.on('tools/post-execute',async(call,result,next)=>{
   const decision=await next();
   if(decision.kind!=='accept')return decision;
   const raw=getRawBusinessResult(call.callId);
   if(raw && !raw.error){
    const literal=raw.content.split('Available Actions:')[1]?.match(/['"]clickables['"]\s*:\s*\[([\s\S]*)\]/)?.[1];
    if(literal!==undefined)choices=[...literal.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map(m=>(m[1]??m[2]).replace(/\\(['"\\])/g,'$1'));
   }
   return decision;
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();
   if(decision.kind!=='allow'||call.name!=='click_action'||!choices.length||denied>=2)return decision;
   const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
   const value=args.value.toLowerCase();
   if(choices.some(x=>x.toLowerCase()===value))return decision;
   const tokens=s=>s.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?/g)||[];
   const wanted=tokens(value);
   const navigation=new Set(['back to search','< prev','next >','description','features','reviews','buy now']);
   const alternatives=choices.filter(v=>!navigation.has(v.toLowerCase()) && !/^[a-z0-9]{10}$/i.test(v)).map(v=>({v,score:tokens(v).filter(t=>wanted.includes(t)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.v);
   denied++;
   const reason=value==='buy now'&&choices.some(x=>x.toLowerCase()==='< prev') ? 'Purchase is not available on this information page. No purchase occurred. Click < prev to return to the product detail page, keep the options already selected, then click buy now if all requested requirements are supported.' : /^[a-z0-9]{10}$/.test(value)&&/\d/.test(value) ? 'This product identifier is not clickable on the current page. No navigation occurred. First click < prev to return to the search results (or back to search if needed), then open the intended identifier from the displayed result list. Do not click another product identifier while still on a product detail page.' : alternatives.length ? 'That exact click value is absent from the current Available Actions. No option was selected. Use an actual displayed value, without combining separate options. Similar available values: '+JSON.stringify(alternatives)+'. Select the requested available variant before buying.' : 'That requested option is not available on this product; no option was selected. Do not substitute a different color, size or specification just because its button exists. Click back to search and look for another product that offers the originally requested '+JSON.stringify(value)+'. Keep the original product type and attributes; then choose exact displayed values.';
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
   return {kind:'deny',reason};
  });
 });
}
