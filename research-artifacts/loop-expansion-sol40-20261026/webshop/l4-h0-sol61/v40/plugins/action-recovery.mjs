// 无效动作恢复：保留真实合法值，解释未应用的点击，按商品记住未完成需求并限一次纠正购买
export const name='action-recovery';
const norm=s=>s.toLowerCase().replace(/\bgrey\b/g,'gray').replace(/^(?:[a-z]\d*|\d+)[_#-]+/,'').replace(/\bxx-large\b/g,'xxl').replace(/\bx-large\b/g,'xl').replace(/[^a-z0-9.]+/g,' ').trim();
const covers=(s,w)=>(' '+norm(s)+' ').includes(' '+w+' ');
function buttons(raw){const a=raw.split('Available Actions:').pop()||'';const list=a.match(/['"]clickables['"]\s*:\s*\[([\s\S]*?)\]/)?.[1]||'';return [...list.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m=>m[1]??m[2]);}
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;let state={values:[],title:'',task:'',product:false},invalid=null,pending=null;const seen=new Set(),blocked=new Set();
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||call.name!=='click_action')return d;const value=call.arguments.value;
 if(value==='buy now'&&state.product&&pending?.title===state.title&&!blocked.has(state.title)&&p.getVisibleInput().step<=14){blocked.add(state.title);const reason='The attempted required option '+JSON.stringify(pending.value)+' was not available and has NOT been selected on this product. Next call click_action({"value":"< prev"}) to restore results, then inspect an item offering the complete requested variant. Observe results before clicking a product ID. Keep the full task: '+state.task;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};}
 if(state.values.length&&!state.values.includes(value)&&!(/^[a-z0-9]{10}$/i.test(value)&&state.values.includes(value.toLowerCase())))invalid={id:call.callId,value,previous:{...state}};return d;});
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=p.getRawBusinessResult(call.callId)?.content||'';if(!raw)return d;const values=buttons(raw),seg=raw.split('[SEP]').map(x=>x.trim()),i=seg.findIndex(x=>/^Price:/.test(x));const task=raw.match(/Instruction:\s*\[SEP\]\s*(.*?)\s*\[SEP\]/s)?.[1]||state.task;
 state={values,title:i>0?seg[i-1]:values.includes('< prev')?state.title:'',task,product:values.includes('buy now')};
 if(pending&&state.title!==pending.title)pending=null;
 if(pending&&call.name==='click_action'&&values.includes(call.arguments.value)&&covers(call.arguments.value,pending.wanted))pending=null;
 if(!invalid||invalid.id!==call.callId||raw.includes('Thank you for shopping'))return d;const fail=invalid;invalid=null;const key=fail.previous.title+'|'+fail.value;if(seen.has(key))return d;seen.add(key);const wanted=norm(fail.value);const literal=wanted&&covers(task,wanted)&&!['buy now','< prev','back to search'].includes(fail.value)&&!/^[a-z0-9]{10}$/i.test(fail.value);
 if(literal&&state.product)pending={title:state.title,value:fail.value,wanted};
 const aliases=values.filter(v=>norm(v)===wanted);const matching=literal?values.filter(v=>covers(v,wanted)):[];
 let nextStep;if(aliases.length===1)nextStep='Next call click_action with '+JSON.stringify({value:aliases[0]})+'. This is the exact current spelling of that option.';
 else if(matching.length)nextStep='Current values containing that wording: '+matching.join(' OR ')+'. Select only a value that matches the COMPLETE requested variant; do not choose merely the first base-color match.';
 else if(values.includes('< prev'))nextStep='Next call click_action({"value":"< prev"}). Observe the returned page before selecting another product. '+(fail.value==='buy now'?'On an information page this returns to the SAME product, where buying becomes available.':'Inspect an alternative that actually offers the requested value; do not substitute an unavailable option.');
 else nextStep='Select from the ACTUAL current clickable values: '+values.join(', ')+'.';
 const text='Action recovery: '+JSON.stringify(fail.value)+' was not among the actual clickable values on the previous page. That click did not establish a selected variant or a product switch. '+nextStep+'\nComplete task: '+task;
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};});});}
