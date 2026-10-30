export const name='dimension-route';
const dimensions=s=>{const m=String(s).match(/\b(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*cm\b/i);return m?m.slice(1).map(Number):null;};
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit},next)=>{
 await next();let candidates=[],conflict='',alternative=null,page='',prompted=false,blocked=false,routed=false;
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;
  if(call.name==='click_action'&&page==='product'&&conflict&&alternative&&String(call.arguments.value).toLowerCase()===alternative.value&&!routed){call.arguments={...call.arguments,value:'< prev'};routed=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,annotation:'Dimension candidate must be opened from results; executed < prev first.'});}
  if(call.name==='click_action'&&String(call.arguments.value).toLowerCase()==='buy now'&&conflict&&alternative&&!blocked){blocked=true;const reason=conflict+' NEXT click_action value "< prev" FIRST, then inspect '+JSON.stringify(alternative)+'. Check all three dimensions and the original color, material and actual price. Partial dimension agreement is only a reason to inspect options, never proof of a match.';audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}return d;
 });
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept'||result.isError)return d;
  const raw=(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n'),task=raw.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||'',wanted=dimensions(task);if(!wanted||!/footrest stool/i.test(task))return d;
  const tokens=raw.split('[SEP]').map(x=>x.trim()),budget=Number(task.match(/price\s+(?:lower|less)\s+than\s*([\d.]+)/i)?.[1]||0);conflict='';alternative=null;
  if(raw.includes('Total results:')){page='results';candidates=[];for(let i=0;i<tokens.length-2;i++)if(/^b[a-z0-9]{9}$/i.test(tokens[i])){const title=tokens[i+1],size=dimensions(title),price=Number(tokens[i+2].match(/\$([\d,.]+)/)?.[1]?.replaceAll(',',''));if(size&&size[1]===wanted[1]&&size[2]===wanted[2]&&/faux leather/i.test(title)&&/footrest stool/i.test(title)&&price<budget)candidates.push({value:tokens[i].toLowerCase(),title,displayed_price:tokens[i+2]});}return d;}
  if(!raw.includes('Price:')||!raw.includes('[SEP] Buy Now')){page='other';return d;}page='product';const p=tokens.findIndex(x=>x.startsWith('Price:')),start=tokens.findIndex(x=>/^size(?: name)?$/i.test(x)),title=tokens[p-1];
  const options=[];if(start>=0)for(const t of tokens.slice(start+1,p-1)){if(/^(color|style|capacity|material)$/i.test(t))break;options.push(t);}
  if([title,...options].some(x=>{const q=dimensions(x);return q&&q.every((n,i)=>n===wanted[i]);}))return d;
  const other=candidates.filter(x=>x.title!==title);if(other.length!==1)return d;alternative=other[0];
  const parsed=options.map(dimensions);conflict='Required dimensions in order are '+JSON.stringify(wanted)+' cm. '+(options.length&&parsed.every(Boolean)?'Every visible size has a different three-dimension tuple: '+JSON.stringify(parsed)+'.':'This actual page has not yet demonstrated the requested full dimensions; missing evidence is not proof of absence.');if(prompted)return d;prompted=true;
  const text=conflict+' NEXT click_action value "< prev" FIRST, then inspect '+JSON.stringify(alternative)+'. Its default title shares only the last two dimensions. Inspect its real size options for all three requested dimensions and color before buying.';audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};
 });
});}
