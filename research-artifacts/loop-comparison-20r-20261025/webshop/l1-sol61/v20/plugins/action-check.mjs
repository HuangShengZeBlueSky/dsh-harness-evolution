export const name='action-check';
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;let available=null,denials=0;
 function observe(text){const list=text.match(/['"]clickables['"]\s*:\s*\[([\s\S]*?)\]\s*}/)?.[1];if(list===undefined)return;available=(list.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g)||[]).map(x=>x.slice(1,-1).replace(/\\(.)/g,'$1'));}
 for(const m of p.body.history||[])observe(m.content||'');
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind==='accept')observe(p.getRawBusinessResult(call.callId)?.content||'');return d;});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||call.name!=='click_action'||!available||denials>=2)return d;let args=call.arguments;if(typeof args==='string')try{args=JSON.parse(args)}catch{}const v=args?.value;if(typeof v!=='string'||available.includes(v.toLowerCase()))return d;denials++;const reason='The click '+JSON.stringify(v)+' is NOT available on the current page and would not select anything. '+(available.includes('buy now')?'If this is a required variant, click "< prev" and inspect another product that offers it; do not buy a product missing the required variant. ':'Use a currently available navigation action first. ' )+'Exact available values: '+JSON.stringify(available);audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
