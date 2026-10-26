/** Experiment 1 repairs. State comes only from visible conversation and real tool receipts. */
const states = new WeakMap();
const str = m => (m?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
const digits = s => String(s || '').replace(/\D/g, '');
const escalation = t => /(?:i(?:’|'| a)?m|i(?:’|'| wi)?ll|you are|you(?:’|')re|we(?:’|')re).{0,55}(?:transfer|escalat)|being transferred|transfer(?:ring|red) you/i.test(t);
function sessionState(p) {
 if (states.has(p.agent)) return states.get(p.agent);
 const s = {cursor:0,phone:null,phoneText:null,users:[],lines:{},plans:{},bills:{},customer:null,calls:new Map(),receipts:[],facts:{},queryCount:0,paymentRequested:null,paidReport:null,policyDate:(p.body.system_prompt.match(/current time is (\d{4}-\d\d-\d\d)/i)||[])[1]};
 s.update = () => {
  const events=p.agent.session.snapshotEvents();
  for (const e of events.slice(s.cursor)) {
   const m=e.type==='user/message'?e.data:e.data?.message;if(!m)continue;
   const t=str(m);
   if(m.role==='user'&&t){
    s.users.push(t);
    const phones=[...t.matchAll(/\b\d{3}[- ]\d{3}[- ]\d{4}\b/g)];
    if(phones.length===1){s.phoneText=phones[0][0];s.phone=digits(s.phoneText);}
    if(/\b(?:in France|abroad|overseas|travelling internationally|traveling internationally)\b/i.test(t))s.facts.abroad=true;
    if(/(?:i(?:’|'| have)?ve|i have|i just|successfully|made the).{0,35}(?:paid|payment)|payment.{0,20}(?:went through|successful)/i.test(t))s.paidReport=t.slice(0,500);
    const patterns={network:/\b(2G|3G|4G|5G)\b/gi,wifiCalling:/wi-?fi calling.{0,40}\b(on|off|enabled|disabled)\b/gi,deviceRoaming:/(?:data roaming|roaming on (?:my|the) phone).{0,45}\b(on|off|enabled|disabled)\b/gi,sim:/(?:sim (?:card )?(?:status|is)|sim card).{0,35}\b(missing|locked_pin|locked|active)\b/gi};
    for(const [key,rx] of Object.entries(patterns)){const a=[...t.matchAll(rx)];if(a.length)s.facts[key]={value:a.at(-1)[1],evidence:t.slice(0,650)};}
    if(/(?:can't|cannot|unable to|still).{0,25}(?:send|work|connect)|(?:test|MMS|speed).{0,30}(?:fail|no connection)/i.test(t))s.facts.latestFailure=t.slice(0,650);
   }
   if(m.role==='assistant')for(const c of m.content||[])if(c.type==='tool-call'){let a;try{a=typeof c.arguments==='string'?JSON.parse(c.arguments):c.arguments;}catch{a={};}s.calls.set(c.id,{name:c.name,args:a||{}});}
   if(m.role==='tool'){
    const call=s.calls.get(m.source?.callId);if(!call)continue;
    const raw=p.getRawBusinessResult(m.source.callId);if(!raw||raw.error||m.isError)continue;
    let v;try{v=JSON.parse(raw.content);}catch{v=null;}
    const put=x=>{if(!x||typeof x!=='object')return;if(x.line_id&&x.phone_number)s.lines[x.line_id]={...s.lines[x.line_id],...x};if(x.plan_id&&x.data_limit_gb!==undefined)s.plans[x.plan_id]=x;if(x.bill_id)s.bills[x.bill_id]=x;if(x.line)s.lines[x.line.line_id]={...s.lines[x.line.line_id],...x.line};};
    if(Array.isArray(v))v.forEach(put);else put(v);
    if(call.name==='get_customer_by_phone'||call.name==='get_customer_by_name'){if(v?.customer_id)s.customer=v;s.queryCount++;}
    if(call.name==='get_data_usage'&&v?.line_id)s.lines[v.line_id]={...s.lines[v.line_id],...v};
    if(['enable_roaming','disable_roaming'].includes(call.name)&&s.lines[call.args.line_id])s.lines[call.args.line_id].roaming_enabled=call.name==='enable_roaming';
    if(call.name==='refuel_data'&&s.lines[call.args.line_id]&&v?.new_data_refueling_gb!==undefined)s.lines[call.args.line_id].data_refueling_gb=Number(v.new_data_refueling_gb);
    if(call.name==='send_payment_request')s.paymentRequested=call.args.bill_id;
    if(['refuel_data','resume_line','enable_roaming','transfer_to_human_agents'].includes(call.name))s.receipts.push({name:call.name,args:call.args,call_id:m.source.callId});
   }
  }
  s.cursor=events.length;
 };
 s.target=()=>Object.values(s.lines).find(l=>s.phone&&digits(l.phone_number)===s.phone);
 s.hasReceipt=name=>s.receipts.some(r=>r.name===name&&(!r.args.line_id||r.args.line_id===s.target()?.line_id));
 s.wantsHuman=()=>/please.{0,25}(?:transfer|human)|yes.{0,30}(?:transfer|human)|go ahead.{0,25}transfer/i.test(s.users.at(-1)||'')&&!/before|rather not|anything else/i.test(s.users.at(-1)||'');
 s.expired=()=>{const l=s.target();return !!(l&&s.policyDate&&l.contract_end_date&&l.contract_end_date<s.policyDate&&l.status==='Suspended');};
 states.set(p.agent,s);return s;
}
const descriptions={
 receipts:'Only real tool-channel calls and successful receipts establish business execution. A JSON object or <tool_call> printed in text is not execution. Before announcing transfer, call transfer_to_human_agents. Before reporting refuel or line restoration, obtain the corresponding successful tool receipt. Do not repeat an already successful action.',
 identity:'Keep the exact user-supplied phone string for lookups. Do not invent birth dates. Bind target phone to an observed Line record before line-scoped actions. Other lines are comparison records, not the target.',
 progress:'Maintain separate completed repairs, failed symptom tests and applicable open branches. A reported 2G connection is an unresolved network-preference branch, even after other repairs. Recheck only what current evidence leaves open. Guide one action at a time; respect explicit human requests and policy-required escalation.',
 roaming_quota:'Carrier-account roaming and phone Data Roaming are distinct. For unresolved MMS/data, an unqueried target line or quota is UNKNOWN, not normal. Inspect the relevant account facts before declaring all remedies exhausted. When abroad and verified account roaming is off, handle the permitted account action and inspect its receipt. Never infer consent to a purchase.',
 device:'The customer can inspect and change phone settings. Missing assistant-side device tools do not prevent guiding the customer. For unresolved No Service or No Signal after account, airplane mode, and SIM checks, ask the customer to inspect APN settings. If the customer reports the APN is incorrect, guide reset to default, then reboot to apply it, then recheck cellular service before transfer. For an unresolved MMS issue, ask the customer to inspect the APN settings and report whether the MMSC URL is present. If it is missing, guide a reset to default, then a reboot to apply the reset, then a fresh MMS attempt. When the customer reports missing messaging app SMS or storage permissions, guide them to grant only those missing permissions and retry MMS before transfer. If MMS still fails, ask whether Wi-Fi Calling is enabled; when it is on, guide the customer to turn it off and try MMS again before transfer. Do not claim Wi-Fi Calling was changed without the customer confirming it. Do not skip a pending step when considering transfer. Never invent an APN/MMSC server address. Treat settings, signal, and actual MMS/data tests separately.',
 contract:'Keep contract-expiry and unpaid-bill suspension separate, on the verified target line. An expired contract requiring escalation is not fixed by bill payment. Do not borrow another line’s status or suggested workflow.',
 payment:'A payment request is not a payment; payment is not line restoration. After the user reports paying the relevant overdue bill, verify its status if needed, then perform the permitted resume_line action and inspect its receipt. Do not claim that payment automatically resumed service.'
};
export function installRepair(ctx,kind){
 const id='experiment1/'+kind;
 ctx.on('telecom/setup',async(p,next)=>{
  await next();const {ac,audit}=p,s=sessionState(p);const emit=(hook,data)=>audit({method_id:id,surface:'custom',hook,...data});
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const out=await next();s.update();let extra='';const l=s.target();
   if(kind==='identity')extra=JSON.stringify({user_phone:s.phoneText,target_line:l?.line_id,observed_lines:Object.values(s.lines).map(x=>({line_id:x.line_id,phone_number:x.phone_number}))});
   if(kind==='progress')extra=JSON.stringify({latest_observed_conditions:s.facts,last_user_report:s.users.at(-1)});
   if(kind==='roaming_quota')extra=JSON.stringify({target:l?{line_id:l.line_id,account_roaming:l.roaming_enabled,used:l.data_used_gb,refueled:l.data_refueling_gb,plan:s.plans[l.plan_id]||null}:null,abroad:s.facts.abroad||false});
   if(kind==='payment')extra=JSON.stringify({requested_bill:s.paymentRequested,payment_report:s.paidReport,target_status:l?.status,restoration_receipt:s.hasReceipt('resume_line')});
   const text=descriptions[kind]+(extra?'\nVisible evidence: '+extra:'');emit('system-prompt/assemble',{text});
   return {...out,sections:[...out.sections,{name:id,order:90,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const decision=await next();if(decision.kind!=='allow')return decision;s.update();let reason='';const a=call.arguments||{};
   if(kind==='identity'){
    if(call.name==='get_customer_by_phone'&&(!s.phoneText||a.phone_number!==s.phoneText))reason=`Use the exact user-supplied phone ${s.phoneText||'(not yet provided; ask first)'}. Do not change or invent it.`;
    if(call.name==='get_customer_by_name'&&a.dob&&!s.users.some(t=>t.includes(a.dob)))reason='Date of birth was not provided in the user conversation. Ask for it or use the supplied phone; do not invent a date.';
    if(['enable_roaming','disable_roaming','refuel_data','resume_line','suspend_line','get_data_usage'].includes(call.name)&&(!s.target()||a.line_id!==s.target().line_id))reason='Query Line records and match the user’s issue phone before using line-scoped facts or actions. Verified target: '+(s.target()?.line_id||'unknown');
   }
   if(kind==='contract'&&s.expired()&&['resume_line','send_payment_request'].includes(call.name))reason='The verified target line is suspended with an expired contract. Payment does not renew the contract. Follow the policy escalation path and actually call the transfer tool.';
   if(kind==='device'&&call.name==='transfer_to_human_agents'&&!s.wantsHuman()&&!s.expired()&&!/locked/i.test(s.facts.sim?.value||'')&&/\b(?:no service|no signal)\b/i.test(s.users[0]||'')&&/\b(?:no service|no signal)\b/i.test(s.users.at(-1)||'')){
    const reports=s.users;
    const inspected=reports.some(x=>/(?:APN|access point name).{0,90}(?:incorrect|wrong|normal|correct|internet|settings|name)|(?:checked|inspected).{0,50}APN/i.test(x));
    const incorrect=reports.some(x=>/(?:APN|access point name).{0,90}(?:incorrect|wrong|bad|broken)|(?:incorrect|wrong|bad|broken).{0,50}APN/i.test(x));
    const reset=reports.findLastIndex(x=>/(?:I|I've|already|just|settings were|phone says).{0,70}reset.{0,30}APN|APN.{0,45}(?:were|was|has been) reset/i.test(x));
    const reboot=reports.findLastIndex(x=>/(?:I|I've|phone|it).{0,40}(?:rebooted|restarted)|(?:reboot|restart).{0,25}(?:done|complete|finished)/i.test(x));
    if(!inspected)reason='Cellular service is still absent, but the customer has not inspected APN settings. Guide that check before transferring.';
    else if(incorrect&&reset<0)reason='The customer reported incorrect APN settings. Guide reset to default before transferring.';
    else if(incorrect&&reset>=0&&reboot<reset)reason='The customer reset APN settings but has not confirmed a subsequent reboot. Ask them to reboot and recheck service before transferring.';
   }
   if(kind==='device'&&call.name==='transfer_to_human_agents'&&!s.wantsHuman()&&!s.expired()&&!/locked/i.test(s.facts.sim?.value||'')&&/\bMMS\b|picture (?:message|text)|send (?:a |any )?(?:photo|picture)/i.test(s.users.slice(0,3).join(' '))&&s.facts.latestFailure&&!/^(?:off|disabled)$/i.test(s.facts.wifiCalling?.value||''))reason=s.facts.wifiCalling?'The customer reports Wi-Fi Calling is on. Guide them to turn it off and retry MMS before transferring; wait for their report.':'Wi-Fi Calling has not been checked with the customer. Ask whether it is enabled; if on, guide them to turn it off and retry MMS before transferring.';
   if(reason){emit('tools/pre-execute',{call_id:call.callId,target:call.name,decision:'deny',reason});return {kind:'deny',reason};}return decision;
  });
  ac.on('telecom/review-response',async(payload,next)=>{
   const out=await next();s.update();const m=payload.message,t=m.content||'';if(m.tool_calls?.length)return out;const notes=[];const l=s.target();
   if(kind==='receipts'){
    if(/<tool_call>|"(?:name|tool)"\s*:\s*"(?:refuel_data|resume_line|enable_roaming|transfer_to_human_agents)"/i.test(t))notes.push('A tool invocation was printed as ordinary text. Use an actual tool call through the provided tool interface, not text or JSON in content.');
    if(escalation(t)&&!s.hasReceipt('transfer_to_human_agents'))notes.push('No successful transfer receipt exists. If transferring now, make transfer_to_human_agents the next real tool call; do not announce a completed transfer first.');
    if(/(?:refuel(?:ing)?|data (?:top.?up|addition)).{0,35}(?:success|completed|processed)|(?:successfully|have|has).{0,20}(?:added|refueled).{0,15}(?:GB|data)/i.test(t)&&!s.hasReceipt('refuel_data'))notes.push('No successful refuel_data receipt exists. Do not claim data was added. Carry out the exact authorized purchase via the tool, or accurately state it has not happened.');
   }
   if(kind==='progress'&&escalation(t)&&!s.wantsHuman()&&!s.expired()&&!/locked/i.test(s.facts.sim?.value||'')&&s.facts.network?.value==='2G')notes.push('The latest customer report still shows 2G. This is an actionable network-preference branch, not exhausted troubleshooting. Guide the customer to inspect/change the applicable network setting and report the result.');
   if(kind==='roaming_quota'&&escalation(t)&&!s.wantsHuman()&&!s.expired()&&!/locked/i.test(s.facts.sim?.value||'')){
    if(l&&s.facts.abroad&&l.roaming_enabled===false)notes.push('Verified target account roaming is still OFF while the customer reports being abroad. Phone Data Roaming does not fix it. Address the permitted enable_roaming action before ordinary escalation.');
    else if(/MMS|mobile data|picture message/i.test(s.users.slice(0,2).join(' '))&&(!l||l.data_used_gb===undefined||(!s.plans[l.plan_id]&&l.data_limit_gb===undefined)))notes.push('The relevant target-line quota evidence is still incomplete. Query the matching Line and its plan/usage before claiming account remedies are exhausted.');
   }
   if(kind==='device'){
    const lastReport=s.users.at(-1)||'';
    const permissionMissing=/(?:don.t|do not|doesn.t|does not|can.t|cannot) see.{0,100}\b(?:SMS|storage)\b|\b(?:SMS|storage)\b.{0,45}(?:missing|not (?:listed|allowed|granted|there))|(?:missing|no)\s+(?:SMS|storage)\s+permission/i.test(lastReport);
    if(escalation(t)&&!s.wantsHuman()&&/\bMMS\b|picture (?:message|text)|send (?:a |any )?(?:photo|picture)/i.test(s.users.slice(0,3).join(' '))&&/messaging app|permissions?/i.test(lastReport)&&permissionMissing)notes.push('The customer just reported missing SMS or storage permission for the messaging app. Guide them to grant only the missing permission, then ask for a fresh MMS attempt before considering transfer.');
    if(escalation(t)&&!s.wantsHuman()&&/\bMMS\b|picture (?:message|text)|send (?:a |any )?(?:photo|picture)/i.test(s.users.slice(0,3).join(' '))&&s.facts.latestFailure){
     const reports=s.users;
     const inspection=reports.some(x=>/MMSC.{0,70}(?:URL|set|missing|blank|empty|present)|APN name.{0,50}(?:is|shows)/i.test(x));
     const missing=reports.some(x=>/MMSC.{0,70}(?:missing|blank|empty|not set|no URL|none)/i.test(x));
     const reset=reports.findLastIndex(x=>/(?:I|I've|already|just|settings were|phone says).{0,70}reset.{0,30}APN|APN.{0,45}(?:were|was|has been) reset/i.test(x));
     const reboot=reports.findLastIndex(x=>/(?:I|I've|phone|it).{0,40}(?:rebooted|restarted)|(?:reboot|restart).{0,25}(?:done|complete|finished)/i.test(x));
     if(!inspection)notes.push('MMS still fails, but the customer has not reported inspecting the APN/MMSC setting. Guide that check before transferring; ask whether the MMSC URL is present.');
     else if(missing&&reset<0)notes.push('The customer reported a missing MMSC URL. Guide a reset of APN settings to default rather than transferring or inventing an address.');
     else if(missing&&reset>=0&&reboot<reset)notes.push('The customer reported resetting APN settings, but has not confirmed a subsequent reboot. Ask them to reboot to apply the change and then retry MMS.');
    }
    if(/https?:\/\/(?:mmsc?\.(?:yourcarrier|example)|mms\.example)[^\s`"<>]*/i.test(t))notes.push('That APN/MMSC URL has no verified source. Guide the customer through the policy-supported reset to default, reboot if required, and retest; do not invent a carrier server address.');
    if(escalation(t)&&/(?:no|not|don't|cannot|can't|unable|unavailable).{0,70}(?:access|available|tool)|tool.{0,30}(?:unavailable|not available)/i.test(t)&&!s.wantsHuman()&&!s.expired()&&!/locked/i.test(s.facts.sim?.value||''))notes.push('Lacking an assistant-side device tool is not a reason to abandon an actionable phone setting. Guide the customer to do the applicable action, wait for the report, and retest.');
   }
   if(kind==='payment'&&s.paidReport&&l?.status==='Suspended'&&!s.expired()&&!s.hasReceipt('resume_line')&&/(?:reboot|restart|line.{0,20}(?:active|resum)|service.{0,15}restor)/i.test(t))notes.push('The customer reports payment, but no successful line-restoration receipt exists. Verify the relevant payment if needed and call resume_line for the target line before claiming restoration or treating reboot as sufficient.');
   if(notes.length)emit('telecom/review-response',{decision:'revise',attempt:payload.attempt,notes,original_text:t});
   return {...out,notes:[...(out.notes||[]),...notes]};
  });
 });
}
