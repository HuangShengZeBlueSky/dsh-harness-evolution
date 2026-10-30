export const name='blue-variant';
const heading=/^(?:size(?: name)?|style(?: name)?|color(?: name)?|flavor(?: name)?|scent(?: name)?|pattern(?: name)?|number of items|item package quantity|configuration|length|capacity|material(?: type)?|shape)$/i;
export function apply(ctx){ctx.on('benchmark/setup',async({ac,audit,getRawBusinessResult},next)=>{
 await next();let title='',chosen='',goal='',onProduct=false;const warned=new Set();
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;
 const raw=getRawBusinessResult(call.callId);if(raw?.error||result.isError)return d;
 const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
 const t=typeof raw?.content==='string'?raw.content:(result.content||[]).map(x=>x.text||'').join('\n');
 const p=t.split('Available Actions:')[0].split('[SEP]').map(x=>x.trim()),i=p.findIndex(x=>x.startsWith('Price:'));
 onProduct=i>0;if(!onProduct){if(call.name==='search_action'||a?.value==='back to search'){title='';chosen='';}return d;}
 if(title!==p[i-1]||/^b[a-z0-9]{9}$/i.test(a?.value||''))chosen='';title=p[i-1];goal=p[p.findIndex(x=>x.endsWith('Instruction:'))+1]||'';
 const start=p.findIndex(x=>/^color(?: name)?$/i.test(x));const colors=[];
 if(start>=0)for(const v of p.slice(start+1,i-1)){if(heading.test(v))break;colors.push(v);}
 if(call.name==='click_action'&&colors.includes(a?.value))chosen=a.value;
 return d;});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;
 const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
 if(call.name!=='click_action'||a?.value!=='buy now'||!onProduct||!chosen||warned.has(title))return d;
 const mandatory=goal.split(/\bif possible\b|price (?:lower|less)/i)[0];
 if(/\b(?:or|either)\b/i.test(mandatory))return d;
 const requested=mandatory.match(/\b(?:(?:sky|light|turquoise|baby|dark|navy)\s+)?blue\b/i)?.[0];if(!requested)return d;
 const nonBlue=!/\bblue\b/i.test(chosen)&&/\b(?:black|white|pink|red|green|yellow|orange|brown|grey|gray|purple|gold|silver)\b/i.test(chosen);
 const wrongShade=/\b(?:sky|light|turquoise|baby)\b/i.test(requested)&&/\b(?:navy|dark blue)\b/i.test(chosen);
 if(!nonBlue&&!wrongShade)return d;warned.add(title);
 const reason='Selected color conflicts with the request: required '+JSON.stringify(requested)+', but the last executed color selection is '+JSON.stringify(chosen)+'. A matching size or optional feature does not fix this. Select a genuinely matching listed blue variant if available; otherwise return to search for the required product and color. Do not invent a shade mapping or buy this known conflicting selection. This check occurs once per product.';
 audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};});
});}
