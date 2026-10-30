import {norm,actions,rawText,initialObservation,productGroups} from './visible-state.mjs';
import {ledgerFor,observe} from './public-ledger.mjs';
export const name='demand-ledger';
const phrase=s=>norm(s).replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
function goalOf(s){
 s=norm(s);const explicit=s.match(/(?:i want|in|with)\s+([a-z][a-z &-]{2,45}?)\s+flavo[u]?r\b/);
 if(explicit)return phrase(explicit[1]);
 const after=s.match(/\b(?:drink|shot|candy|milk|tea|coffee)\s+flavo[u]?red\s+([^,.]+?)(?:,|\.| and price|$)/);
 if(after)return phrase(after[1]);
 const before=s.match(/\b([a-z][a-z'-]+)\s+flavo[u]?red\b/);
 return before?phrase(before[1]):'';
}
export function apply(ctx){
 const policy={"guard": false, "guardUntil": 13, "whole": true, "recovery": false};ctx.on('benchmark/setup',async({ac,agent,audit,getRawBusinessResult,getVisibleInput},next)=>{
 await next();const shared=ledgerFor(agent);const recoveryShown=new Set();let latest=initialObservation(agent),goal=goalOf(latest.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]||''),conflict='',warned=false;
 ac.on('tools/post-execute',async(call,result,next)=>{const d=await next();if(d.kind!=='accept')return d;const r=getRawBusinessResult(call.callId);if(!r||r.error||result.isError)return d;latest=rawText(result,r);observe(shared,call,latest);if(!goal)goal=goalOf(latest.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]||'');const gs=productGroups(latest).filter(g=>/^flavo[u]?r/.test(g.label));conflict='';if(!goal||!gs.length)return d;
 let matches=gs.flatMap(g=>g.values.filter(v=>phrase(v)===goal||phrase(v).includes(goal)));
 if(policy.whole){const instruction=' '+phrase(latest.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]||'')+' ';const actual=gs.flatMap(g=>g.values).filter(v=>instruction.includes(' '+phrase(v)+' '));if(actual.length)matches=actual.filter(v=>!actual.some(w=>w!==v&&(' '+phrase(w)+' ').includes(' '+phrase(v)+' ')));}let text=matches.length?'Explicit requested flavor '+JSON.stringify(goal)+' is offered: '+matches.map(value=>JSON.stringify({value})).join(' or ')+'. Click the complete flavor, then finish other required options and buy.':(conflict='Required flavor '+JSON.stringify(goal)+' is absent from these actual flavor choices: '+gs.flatMap(g=>g.values).join(', ')+'. Original/default is not a substitute. Return with < prev to inspect another product or a focused search retaining the same product type and flavor.');
 if(policy.recovery&&conflict&&!recoveryShown.has(goal)&&getVisibleInput().step<12){const task=latest.match(/Instruction:\s*\[SEP\]\s*(.*?)\[SEP\]/s)?.[1]||'';const noun=task.match(/\b(?:salmon|hot chocolate|cocoa|truffles|milk|coffee|tea)\b/i)?.[0]||'';if(noun){recoveryShown.add(goal);text+=' One focused flavor recovery query: '+JSON.stringify({keywords:goal+' '+noun})+'. Check actual variant choices rather than repeating the same default product.';}}const sharedRec=shared.products.get(shared.current);if(sharedRec){sharedRec.issues=sharedRec.issues||{};sharedRec.issues[name]=conflict||(matches.length&&!gs.some(g=>matches.includes(sharedRec.selected[g.label]))?'Required actual flavor selection has not been clicked.':'');}text+=' '+"\u4fee\u590d\u5b8c\u6574\u53e3\u5473\u548cand/&\u5339\u914d\uff0c\u4ee5\u5b9e\u9645\u6574\u7ec4\u9009\u9879\u6307\u5bfc\u9009\u62e9\uff1b\u5148\u4e0d\u989d\u5916\u62d2\u7edd\u8d2d\u4e70\uff0c\u4fdd\u7559\u7236\u7248\u6536\u5c3e\u52a8\u4f5c\u3002";audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation:text});return {...d,content:[...(d.content||result.content),{type:'text',text}]};});
 ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow')return d;const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(call.name==='click_action'&&norm(a.value)==='buy now'&&policy.guard&&conflict&&!warned&&getVisibleInput().step<policy.guardUntil){warned=true;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason:conflict});return {kind:'deny',reason:conflict};}return d;});
});}
