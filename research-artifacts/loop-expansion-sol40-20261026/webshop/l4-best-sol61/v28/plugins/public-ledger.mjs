import {norm,actions,initialObservation,productGroups} from './visible-state.mjs';
const episodes=new WeakMap();
export const textForm=s=>norm(s).replace(/&/g,' and ').replace(/[^a-z0-9.]+/g,' ').replace(/\s+/g,' ').trim();
export function ledgerFor(agent){
 if(episodes.has(agent))return episodes.get(agent);
 const raw=initialObservation(agent);const s={raw,task:raw.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]||'',page:'search',current:'',groups:[],rows:[],products:new Map(),queries:new Map(),done:false,lastCall:''};episodes.set(agent,s);return s;
}
export function observe(s,call,raw){
 if(s.lastCall===call.callId||!raw.includes('Available Actions:'))return s;s.lastCall=call.callId;
 const before=s.raw,oldGroups=s.groups,a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments,clicked=norm(a.value);
 s.task=s.task||raw.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]||'';
 const opening=call.name==='click_action'&&/Page \d+ \(Total results:/.test(before)&&/^[a-z0-9]{10}$/.test(clicked)&&actions(before).includes(clicked);
 if(opening){s.current=clicked;if(!s.products.has(clicked))s.products.set(clicked,{id:clicked,title:'',price:null,selected:{},groups:[],details:'',visits:0});s.products.get(clicked).visits++;}
 const rec=s.products.get(s.current);
 if(rec&&call.name==='click_action'&&actions(before).includes(clicked))for(const g of oldGroups)if(g.values.includes(clicked))rec.selected[g.label]=clicked;
 s.raw=raw;s.available=actions(raw);s.groups=productGroups(raw);const parts=raw.split('Available Actions:')[0].split('[SEP]').map(s=>s.trim());
 if(/Thank you for shopping with us!/i.test(raw)){s.done=true;s.page='purchased';return s;}
 if(/Page \d+ \(Total results:/.test(raw)){
  s.page='results';s.current='';s.rows=[];for(let i=0;i<parts.length-2;i++)if(/^[A-Z0-9]{10}$/.test(parts[i])){const p=parts[i+2].match(/\$([\d.]+)/);s.rows.push({id:norm(parts[i]),title:parts[i+1],price:p?Number(p[1]):null});}
 }else if(s.available.includes('buy now')){
  s.page='product';const idx=parts.findIndex(p=>/^Price:/i.test(p));if(rec){rec.title=parts[idx-1]||rec.title;rec.price=Number(parts[idx]?.match(/\$([\d.]+)/)?.[1])||null;rec.groups=s.groups;}
 }else if(s.available.includes('< prev')){s.page='detail';if(rec&&['features','description'].includes(clicked))rec.details+=' '+parts.slice(4).join(' ');}
 else s.page='search';
 if(call.name==='search_action'){const q=norm(a.keywords);s.queries.set(q,(s.queries.get(q)||0)+1);}
 return s;
}
export function priceLimit(s){const m=s.task.match(/price lower than\s*([\d.]+)/i);return m?Number(m[1]):null;}
