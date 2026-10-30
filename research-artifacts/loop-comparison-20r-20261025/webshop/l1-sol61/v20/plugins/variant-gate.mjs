export const name='variant-gate';
const groups=new Set(['size','color','style','scent','flavor','flavor name','size name','color name','pattern','item package quantity','number of items','length','configuration']);
const norm=s=>' '+s.toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g,w=>({zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12}[w])).replace(/[^a-z0-9.]+/g,' ').trim()+' ';
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{
 await next();const {ac,audit}=p;let request='',options=[],selected=new Set(),warned=false;
 function observe(text){
  request=text.match(/Instruction:\s*\[SEP\]\s*(.*?)\s*\[SEP\]/s)?.[1]||request;
  const parts=text.split('[SEP]').map(x=>x.trim());const start=parts.indexOf('< Prev'),end=parts.findIndex(x=>x.startsWith('Price:'));
  if(start<0||end<0)return;let group=null;options=[];
  for(const item of parts.slice(start+1,end-1)){if(groups.has(item.toLowerCase())){group={label:item,values:[]};options.push(group);}else if(group)group.values.push(item.toLowerCase());}
 }
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;let args=call.arguments;if(typeof args==='string')try{args=JSON.parse(args)}catch{}
  const v=args?.value||'';if(call.name==='search_action'||/^b[a-z0-9]{9}$/i.test(v)||v==='back to search'){selected.clear();warned=false;options=[];}
  if(call.name==='click_action')selected.add(v.toLowerCase());observe(p.getRawBusinessResult(call.callId)?.content||'');return d;});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||call.name!=='click_action'||warned)return d;let args=call.arguments;if(typeof args==='string')try{args=JSON.parse(args)}catch{}if(args?.value?.toLowerCase()!=='buy now')return d;
  const missing=options.map(g=>g.values.filter(v=>norm(request).includes(norm(v))).sort((a,b)=>b.length-a.length)[0]).filter(v=>v&&!selected.has(v));
  if(!missing.length)return d;warned=true;const reason='Required variants are not selected. Before buying, call click_action for each of these exact available values: '+JSON.stringify(missing)+'. Then buy now. A title match does not apply options.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
 });
});}
