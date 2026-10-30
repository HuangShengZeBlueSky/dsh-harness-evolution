// 规格账本：按当前商品记录真实点击的选项组和值，投影任务匹配候选与未完成选择
export const name='option-ledger';
const norm=s=>s.toLowerCase().replace(/[^a-z0-9.]+/g,' ').trim().replace(/\s+/g,' ');
const headings=new Set(['color','colour','size','size name','color name','style','style name','flavor','flavor name','scent','scent name','pattern','pattern name','item package quantity','number of items','configuration','length','item shape']);
function trouserFit(task){if(!/\b(?:jeans?|pants?|trousers?)\b/i.test(task))return null;const w=task.match(/\b(\d+)\s*(?:inch(?:es)?\s*)?waist\b/i),l=task.match(/\b(\d+)\s*(?:inch(?:es)?\s*)?(?:length|inseam)\b/i);return w&&l?{waist:Number(w[1]),leg:Number(l[1])}:null;}
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;const shop=p.shop ||= {};let groups={},chosen={};
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const raw=p.getRawBusinessResult(call.callId)?.content||'';const value=call.arguments?.value;
 if(call.name==='search_action'||(call.name==='click_action'&&/^[a-z0-9]{10}$/i.test(value))){groups={};chosen={};shop.options=null;}
 else if(call.name==='click_action'&&!result.isError)for(const [g,vs] of Object.entries(groups))if(vs.includes(value))chosen[g]=value;
 if(!raw.includes('Price:'))return d;
 const task=raw.match(/Instruction:\s*\[SEP\]\s*(.*?)\s*\[SEP\]/s)?.[1]||'';const target=' '+norm(task.replace(/,?\s*and price lower than.*$/i,''))+' ';
 const seg=raw.split('[SEP]').map(x=>x.trim());const start=seg.indexOf('< Prev'),end=seg.findIndex(x=>/^Price:/.test(x));let group='';const current={};
 for(const x of seg.slice(start+1,end-1)){if(headings.has(x.toLowerCase())){group=x;current[group]=[];}else if(group)current[group].push(x);}
 groups=current;shop.options={groups,chosen,task,title:seg[end-1]};if(!Object.keys(groups).length)return d;
 const rows=[];
 for(const [g,vs] of Object.entries(groups)){let matches=vs.filter(v=>{const clean=norm(v.replace(/^(?:[a-z]\d+|0)\s*(?:#|-)\s*/i,''));if(clean.length===1&&/colou?r/i.test(g))return new RegExp('\\bcolou?r\\s+(?:is\\s+)?'+clean+'\\b').test(norm(task));return clean&&target.includes(' '+clean+' ');});
 const fit=trouserFit(task);if(fit&&/size|waist|inseam/i.test(g)){const tuples=vs.map(v=>({v,m:v.match(/^(\d+)\s*w\s*(?:x|by)?\s*(\d+)\s*l$/i)}));if(tuples.some(x=>x.m))matches=tuples.filter(x=>x.m&&Number(x.m[1])===fit.waist&&Number(x.m[2])===fit.leg).map(x=>x.v);else if(vs.some(v=>/^\d+$/.test(v)))matches=vs.filter(v=>Number(v)===fit.waist);}
 if(matches.length){const longest=Math.max(...matches.map(v=>norm(v).length));matches=matches.filter(v=>norm(v).length===longest);}
 rows.push(`${fit&&/size|waist|inseam/i.test(g)?'Required waist='+fit.waist+'in AND inseam='+fit.leg+'in; ':''}${g}: actual selected=${chosen[g]||'not yet clicked'}; task-text matches=${matches.length?matches.join(' OR '):'check requested wording against available values'}`);}
 const text='Option ledger for this product:\n'+rows.join('\n')+'\nSelect every explicitly requested option using the exact available value. Available options are not selected automatically. Keep completed selections; buy now after the required selections and product match are confirmed.';
 audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};
 });});}
