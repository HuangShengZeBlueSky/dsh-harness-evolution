// 本组已实现的纯计量选项函数：单位、维度、包装与腰围，未注册任何钩子
export const name='measurement-confirm';
const nums={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
function text(s){return s.toLowerCase().replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g,w=>nums[w]).replace(/["”″]/g,' in ').replace(/-/g,' ').replace(/\bfluid\s+ounces?\b|\bfl\.?\s*oz\b/g,'floz').replace(/\bounces?\b/g,'oz').replace(/\bpounds?\b/g,'lb').replace(/\binches?\b/g,'in').replace(/\b(?:feet|foot)\b/g,'ft').replace(/\bmillilit(?:er|re)s?\b/g,'ml').replace(/\bcentimet(?:er|re)s?\b/g,'cm').replace(/\bmillimet(?:er|re)s?\b/g,'mm').replace(/\bby\b/g,'x');}
const lengths={in:25.4,cm:10,mm:1,ft:304.8};
const units={ml:['volume',1],floz:['volume',29.5735295625],oz:['mass',28.349523125],lb:['mass',453.59237],g:['mass',1],kg:['mass',1000],in:['length',25.4],cm:['length',10],mm:['length',1],ft:['length',304.8]};
const near=(a,b)=>Math.abs(a-b)<=Math.max(a,b)*.005;
function specs(s){const a=text(s),pack=a.match(/\b(\d+)\s*packs?\b|\bpacks?\s*(?:of\s*)?(\d+)\b/);const dimensions=[];
 for(const m of a.matchAll(/(\d+(?:\.\d+)?)\s*(in|cm|mm|ft)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(in|cm|mm|ft)?(?:\s*[x×]\s*(\d+(?:\.\d+)?)\s*(in|cm|mm|ft)?)?/g)){const u=m[6]||m[4]||m[2]||null;dimensions.push({values:[m[1],m[3],...(m[5]?[m[5]]:[])].map(Number),unit:u});}
 const measures=[];if(!dimensions.length)for(const m of a.matchAll(/(\d+(?:\.\d+)?)\s*(floz|ml|oz|lb|kg|g|in|cm|mm|ft)\b/g)){const [kind,scale]=units[m[2]];measures.push({kind,value:Number(m[1])*scale});}
 return {dimensions,measures,pack:pack?Number(pack[1]||pack[2]):null};}
function sameDimensions(a,b){return a.values.length===b.values.length&&a.values.every((v,i)=>near(v*(a.unit&&b.unit?lengths[a.unit]:1),b.values[i]*(a.unit&&b.unit?lengths[b.unit]:1)));}
function groupContract(task,group,values,chosen){const req=specs(task),options=values.map(value=>({value,s:specs(value)}));if(/quantity|number of items/i.test(group))for(const o of options)if(o.s.pack===null&&/^\d+$/.test(o.value))o.s.pack=Number(o.value);
 let criterion=null,summary='';if(req.dimensions.length===1&&options.some(o=>o.s.dimensions.length)){criterion=o=>o.s.dimensions.some(d=>sameDimensions(req.dimensions[0],d));summary='dimensions '+req.dimensions[0].values.join(' x ')+(req.dimensions[0].unit||'');}
 else{const kinds=[...new Set(req.measures.map(m=>m.kind))];const applicable=kinds.filter(k=>options.some(o=>o.s.measures.some(m=>m.kind===k))).filter(k=>{const ms=req.measures.filter(m=>m.kind===k);return ms.every(m=>near(m.value,ms[0].value));});if(applicable.length===1){const k=applicable[0],wanted=req.measures.find(m=>m.kind===k);criterion=o=>o.s.measures.some(m=>m.kind===k&&near(m.value,wanted.value));summary=k+' '+wanted.value+' in normalized units';}}
 const packs=req.pack!==null&&options.some(o=>o.s.pack!==null);if(packs){const prior=criterion;criterion=o=>(!prior||prior(o))&&o.s.pack===req.pack;summary+=(summary?'; ':'')+'pack of '+req.pack;}
 if(!criterion)return null;const wanted=options.filter(criterion).map(o=>o.value);if(wanted.includes(chosen))return null;
 const current=options.find(o=>o.value===chosen);return {group,summary,wanted,selected:chosen,conflict:!!current&&!criterion(current)};}

export function measurementChoices(task,group,values){
 const a=text(task),pants=/\b(?:jeans?|pants?|trousers?)\b/i.test(task);const waist=a.match(/\b(\d+(?:\.\d+)?)\s*(?:in\s*)?waist\b/),leg=a.match(/\b(\d+(?:\.\d+)?)\s*(?:in\s*)?(?:length|inseam)\b/);
 if(pants&&waist&&/^(?:size|size name|waist|waist size)$/i.test(group)&&values.some(v=>/^\d+(?:\.\d+)?$/.test(v)))return {group,summary:'waist '+waist[1]+' in'+(leg?'; leg length '+leg[1]+' in remains a separate requirement':''),wanted:values.filter(v=>/^\d+(?:\.\d+)?$/.test(v)&&Number(v)===Number(waist[1]))};
 return groupContract(task,group,values,undefined);
}
