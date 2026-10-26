// Policy logic runs inside DSH. Facts contain only account-side records, not user-device state.
const find = (db, table, key, value) => (db[table] || []).find(x => x[key] === value);
const cust = (db, a) => find(db, 'customers', 'customer_id', a.customer_id);
const line = (db, a) => find(db, 'lines', 'line_id', a.line_id);
const suspended = (db, c) => (db.lines || []).filter(x => c.line_ids.includes(x.line_id) && x.status === 'Suspended');
const expired = (l, today) => l.contract_end_date != null && l.contract_end_date < today;
export const checks = {
 phone_number_format(db, a) {
  const n = a.phone_number || ''; if (n && !/^\d{3}-\d{3}-\d{4}$/.test(n)) return `Phone number '${n}' is not in the expected format. Expected: 'NXX-NXX-XXXX' (10 digits, dashes, no country code — e.g. '555-123-4567'). Ask the customer: 'Could you provide your 10-digit phone number, for example starting with your area code, like 555-123-4567?'`;
 },
 customer_id_validation(db,a) {
  const id=a.customer_id || ''; if(!id)return;
  if(!/^C\d+$/.test(id))return `Invalid customer_id format '${id}'. Customer IDs follow the pattern 'C1001'. Call get_customer_by_phone to look up the correct ID.`;
  if(!cust(db,a))return `Customer '${id}' not found. Call get_customer_by_phone to obtain the correct customer_id.`;
 },
 line_ownership(db,a) {
  const id=a.line_id || '';if(!id)return;
  if(!/^L\d+$/.test(id))return `Invalid line_id format '${id}'. Line IDs follow the pattern 'L1001'. Get the customer first to see their line IDs.`;
  const c=cust(db,a);if(!c)return;
  if(!c.line_ids.includes(id)){const details=db.lines.filter(l=>c.line_ids.includes(l.line_id)).map(l=>`${l.line_id} (phone: ${l.phone_number})`).join(', ');
   return `Line '${id}' does not belong to customer ${a.customer_id}. Customer ${a.customer_id} has lines: ${details}. Use the line_id that matches the customer's phone number.`;}
 },
 suspend_line_status(db,a){const l=line(db,a);if(l&&l.status!=='Active')return `Line ${a.line_id} has status '${l.status}', not 'Active'. Only Active lines can be suspended. ${l.status==='Suspended'?'Use resume_line to reactivate it first.':''}`;},
 resume_line_status_check(db,a){const l=line(db,a);if(!l)return;if(l.status==='Active')return `Line ${a.line_id} is already Active — resume_line is not needed. If the customer is still experiencing issues, check for other causes (data quota, roaming settings, device configuration).`;
  if(!['Suspended','Pending Activation'].includes(l.status))return `Line ${a.line_id} has status '${l.status}'. resume_line can only reactivate lines that are currently Suspended or Pending Activation. Transfer to a human agent if the line is Closed or in an unexpected state.`;},
 resume_line_eligibility(db,a){const c=cust(db,a);if(!c)return;const bills=c.bill_ids.flatMap(id=>db.bills.filter(b=>b.bill_id===id&&b.status==='Overdue'));
  if(bills.length)return `Customer ${a.customer_id} still has outstanding overdue bills (${bills.map(b=>b.bill_id).join(', ')}). All overdue bills must be paid before the line suspension can be lifted. Use send_payment_request to initiate payment first.`;
  const l=line(db,a);if(l&&expired(l,db.today))return `Line ${a.line_id} contract expired on ${l.contract_end_date} (today: ${db.today}). Per policy, a line with an expired contract cannot be resumed, even if all overdue bills have been paid. Transfer the customer to a human agent for contract renewal.`;
 },
 bill_ownership(db,a){const c=cust(db,a);if(c&&!c.bill_ids.includes(a.bill_id))return `Bill '${a.bill_id}' does not belong to customer ${a.customer_id}. Customer ${a.customer_id} has bills: ${c.bill_ids.join(', ')}. Use get_bills_for_customer to list the correct bill IDs.`;},
 send_payment_expired_contract(db,a){const c=cust(db,a);if(!c)return;const ls=suspended(db,c),ex=ls.filter(l=>expired(l,db.today));if(!ex.length||ls.some(l=>!expired(l,db.today)))return;
  const details=ex.map(l=>`${l.line_id} (${l.phone_number}, contract ended ${l.contract_end_date})`).join(', ');
  return `Do not send payment request ${a.bill_id||''} yet. Customer ${a.customer_id} has suspended line(s) with expired contracts: ${details}. Per policy, expired-contract lines cannot be resumed even after overdue bills are paid. Transfer the customer to a human agent for contract renewal instead of collecting payment.`;},
 send_payment_request_overdue(db,a){const b=find(db,'bills','bill_id',a.bill_id);if(b&&b.status!=='Overdue')return `Bill ${a.bill_id} has status '${b.status}', not 'Overdue'. Per policy, a payment request can only be sent for overdue bills. Check the bill status with get_bills_for_customer before proceeding.`;},
 send_payment_one_at_a_time(db,a){const c=cust(db,a);if(!c)return;const b=db.bills.find(b=>c.bill_ids.includes(b.bill_id)&&b.status==='Awaiting Payment'&&b.bill_id!==a.bill_id);if(b)return `Customer ${a.customer_id} already has bill ${b.bill_id} in 'Awaiting Payment' status. Only one bill can be awaiting payment at a time. Wait for the current payment request to be processed before sending a new one.`;},
 refuel_data_limit(db,a){if(a.gb_amount>2)return `Requested refuel amount of ${a.gb_amount} GB exceeds the per-session maximum of 2 GB. Please adjust the amount to 2 GB or less. If the customer needs more than 2 GB, you may call refuel_data a second time after the first refuel is confirmed.`;},
 refuel_data_active_line(db,a){const c=cust(db,a);if(!c||!c.line_ids.includes(a.line_id))return;const l=line(db,a);if(l&&l.status!=='Active')return `Line ${a.line_id} has status '${l.status}'. Data can only be refueled on Active lines. If the line is suspended due to an overdue bill, the customer must pay the overdue bill and have the line resumed first.`;},
};
export const processors = {
 customer_phone_line(db,r,a){if(!r?.line_ids||!a.phone_number)return;const l=db.lines.find(x=>x.phone_number===a.phone_number);if(l&&r.line_ids.length>1)return `📌 Use line_id='${l.line_id}' for ALL writes (phone ${a.phone_number} matches this line; customer has ${r.line_ids.length} lines: ${r.line_ids.join(', ')}).`;},
 line_status(db,r,a){if(!String(a.id||'').startsWith('L')||!r||typeof r!=='object'||Array.isArray(r))return;const notes=[];
  if(!r.roaming_enabled)notes.push('⚠️ ROAMING OFF (roaming_enabled=False). If abroad: call enable_roaming + remind toggle_roaming on device.');
  const p=find(db,'plans','plan_id',r.plan_id);if(p){const total=Number(p.data_limit_gb)+Number(r.data_refueling_gb);if(Number(p.data_limit_gb)>0&&Number(r.data_used_gb)>=total)notes.push(`⚠️ QUOTA EXHAUSTED (${Number(r.data_used_gb).toFixed(1)}/${total.toFixed(1)} GB). Offer refuel_data(${r.line_id}, max 2 GB, $${Number(p.data_refueling_price_per_gb).toFixed(2)}/GB).`);}
  if(r.status==='Suspended')notes.push(expired(r,db.today)?`⚠️ SUSPENDED — contract expired ${r.contract_end_date}. Call transfer_to_human_agents(summary=...) TOOL — not just text.`:'⚠️ SUSPENDED. Fix: get_bills_for_customer → send_payment_request → make_payment → resume_line → reboot.');
  return notes.length?notes.join('\n'):null;
 },
 bills_overdue(db,r,a){if(!Array.isArray(r))return;const overdue=r.filter(b=>b.status==='Overdue');if(!overdue.length)return;const c=cust(db,a);if(c){const ls=suspended(db,c);if(ls.some(l=>expired(l,db.today))&&!ls.some(l=>!expired(l,db.today)))return "⚠️ OVERDUE bill exists, but the suspended line's contract has expired. Do NOT collect payment for restoration; call transfer_to_human_agents(summary=...) TOOL for contract renewal.";}
  return `⚠️ OVERDUE: ${overdue.map(b=>`${b.bill_id} ($${Number(b.total_due).toFixed(2)})`).join(', ')}. send_payment_request → make_payment → resume_line → reboot.`;},
 payment_workflow(){return '✓ Payment request sent. Next: customer uses check_payment_request → make_payment → verify PAID → resume_line → customer reboots.';},
 data_quota(db,r){if(!r||typeof r!=='object'||Array.isArray(r))return;const used=Number(r.data_used_gb||0),limit=Number(r.data_limit_gb||0),extra=Number(r.data_refueling_gb||0);if(limit>0&&used>=limit+extra)return `⚠️ QUOTA EXHAUSTED (${used.toFixed(1)}/${(limit+extra).toFixed(1)} GB). This blocks all data. Offer refuel_data (max 2 GB, confirm price first).`;},
 enable_roaming_result(db,r){return String(r||'').toLowerCase().includes('already enabled')?'ℹ️ Account roaming was already ON. Fix is device-side: tell customer to toggle Data Roaming ON in settings (toggle_roaming).':'✓ Account roaming enabled. ALSO: customer must toggle Data Roaming ON in device settings (toggle_roaming). Then re-run speed test.';},
 append_note(db,r,a,c){return c.text;},
 result_field_note(db,r,a,c){return r?.[c.field]===c.equals?c.text:null;},
};
const noFacts=new Set(['phone_number_format','refuel_data_limit','payment_workflow','data_quota','enable_roaming_result','append_note','result_field_note']);
export function installNativeAccountRule(ctx,method) {
 ctx.on('telecom/setup',async(payload,next)=>{
  await next();const {ac,audit,getAccountFacts,getRawBusinessResult}=payload;
  const key=method.config.name, cfg=method.config.args||{};
  const emit=(hook,detail={})=>audit({method_id:method.id,surface:method.surface,target:method.target,implementation:'native-js-account-rule',rule:key,hook,...detail});
  const facts=(exec,phase)=>noFacts.has(key)?Promise.resolve({}):getAccountFacts({tool:exec.name,args:exec.arguments||{},call_id:exec.callId,phase});
  emit('loaded',{source_old_id:method.source_old_id,execution_location:'DSH JavaScript',facts_transport:noFacts.has(key)?'none':'account-facts-only'});
  if(method.surface==='validation')ac.on('tools/pre-execute',async(exec,next)=>{const decision=await next();if(decision.kind!=='allow'||exec.name!==method.target)return decision;
   const reason=checks[key](await facts(exec,'before'),exec.arguments||{},cfg);
   emit('tools/pre-execute',{call_id:exec.callId,args:exec.arguments||{},decision:reason?'deny':'allow',reason:reason||'',error_type:reason?'ValueError':null});
   return reason?{kind:'deny',reason}:decision;
  });
  else ac.on('tools/post-execute',async(exec,original,next)=>{const decision=await next();if(decision.kind!=='accept'||exec.name!==method.target)return decision;
   const raw=getRawBusinessResult(exec.callId);if(original.isError||raw?.error){emit('tools/post-execute',{call_id:exec.callId,skipped:'business-error',annotation:null});return decision;}
   let value=raw?.content??original.content.filter(x=>x.type==='text').map(x=>x.text).join('');try{value=JSON.parse(value);}catch{}
   const annotation=processors[key](await facts(exec,'after'),value,exec.arguments||{},cfg);
   emit('tools/post-execute',{call_id:exec.callId,annotation:annotation??null,skipped:annotation?null:'condition-not-met'});
   return annotation?{...decision,content:[...(decision.content||original.content),{type:'text',text:'\n\n'+annotation}]}:decision;
  });
 });
}

// Atomic policy plugins: every function below is selected independently.
// Old functions above remain available for immutable recipes that already ran.
Object.assign(checks, {
 customer_id_format(db,a){const id=a.customer_id||'';if(id&&!/^C\d+$/.test(id))return `Invalid customer_id format '${id}'. Customer IDs follow the pattern 'C1001'. Call get_customer_by_phone to look up the correct ID.`;},
 customer_exists(db,a){const id=a.customer_id||'';if(id&&!cust(db,a))return `Customer '${id}' not found. Call get_customer_by_phone to obtain the correct customer_id.`;},
 line_id_format(db,a){const id=a.line_id||'';if(id&&!/^L\d+$/.test(id))return `Invalid line_id format '${id}'. Line IDs follow the pattern 'L1001'. Get the customer first to see their line IDs.`;},
 line_belongs_to_customer(db,a){const id=a.line_id||'',c=cust(db,a);if(!id||!c)return;if(!c.line_ids.includes(id)){const details=db.lines.filter(l=>c.line_ids.includes(l.line_id)).map(l=>`${l.line_id} (phone: ${l.phone_number})`).join(', ');return `Line '${id}' does not belong to customer ${a.customer_id}. Customer ${a.customer_id} has lines: ${details}. Use the line_id that matches the customer's phone number.`;}},
 resume_no_overdue_bills(db,a){const c=cust(db,a);if(!c)return;const bills=c.bill_ids.flatMap(id=>db.bills.filter(b=>b.bill_id===id&&b.status==='Overdue'));if(bills.length)return `Customer ${a.customer_id} still has outstanding overdue bills (${bills.map(b=>b.bill_id).join(', ')}). All overdue bills must be paid before the line suspension can be lifted. Use send_payment_request to initiate payment first.`;},
 resume_contract_valid(db,a){if(!cust(db,a))return;const l=line(db,a);if(l&&expired(l,db.today))return `Line ${a.line_id} contract expired on ${l.contract_end_date} (today: ${db.today}). Per policy, a line with an expired contract cannot be resumed, even if all overdue bills have been paid. Transfer the customer to a human agent for contract renewal.`;},
});
const isLineResult=(r,a)=>String(a.id||'').startsWith('L')&&r&&typeof r==='object'&&!Array.isArray(r);
function overdueContext(db,r,a){
 if(!Array.isArray(r))return null;const overdue=r.filter(b=>b.status==='Overdue');if(!overdue.length)return null;
 const c=cust(db,a),ls=c?suspended(db,c):[];
 return {overdue,expiredOnly:ls.some(l=>expired(l,db.today))&&!ls.some(l=>!expired(l,db.today))};
}
Object.assign(processors, {
 line_roaming_note(db,r,a){if(isLineResult(r,a)&&!r.roaming_enabled)return '⚠️ ROAMING OFF (roaming_enabled=False). If abroad: call enable_roaming + remind toggle_roaming on device.';},
 line_quota_note(db,r,a){if(!isLineResult(r,a))return;const p=find(db,'plans','plan_id',r.plan_id);if(!p)return;const total=Number(p.data_limit_gb)+Number(r.data_refueling_gb);if(Number(p.data_limit_gb)>0&&Number(r.data_used_gb)>=total)return `⚠️ QUOTA EXHAUSTED (${Number(r.data_used_gb).toFixed(1)}/${total.toFixed(1)} GB). Offer refuel_data(${r.line_id}, max 2 GB, $${Number(p.data_refueling_price_per_gb).toFixed(2)}/GB).`;},
 line_suspension_note(db,r,a){if(!isLineResult(r,a)||r.status!=='Suspended')return;return expired(r,db.today)?`⚠️ SUSPENDED — contract expired ${r.contract_end_date}. Call transfer_to_human_agents(summary=...) TOOL — not just text.`:'⚠️ SUSPENDED. Fix: get_bills_for_customer → send_payment_request → make_payment → resume_line → reboot.';},
 bills_expired_contract_note(db,r,a){const c=overdueContext(db,r,a);if(c?.expiredOnly)return "⚠️ OVERDUE bill exists, but the suspended line's contract has expired. Do NOT collect payment for restoration; call transfer_to_human_agents(summary=...) TOOL for contract renewal.";},
 bills_payment_note(db,r,a){const c=overdueContext(db,r,a);if(c&&!c.expiredOnly)return `⚠️ OVERDUE: ${c.overdue.map(b=>`${b.bill_id} ($${Number(b.total_due).toFixed(2)})`).join(', ')}. send_payment_request → make_payment → resume_line → reboot.`;},
});
for (const key of ['customer_id_format','line_id_format','line_roaming_note']) noFacts.add(key);
