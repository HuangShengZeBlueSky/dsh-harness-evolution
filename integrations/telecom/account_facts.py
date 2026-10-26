"""Read-only, selected account facts. All policy decisions run in DSH JavaScript."""
import json
from tau2.domains.telecom.utils import get_today

FIELDS = {
    'customers': ('customer_id', 'line_ids', 'bill_ids'),
    'lines': ('line_id', 'phone_number', 'status', 'contract_end_date', 'plan_id'),
    'bills': ('bill_id', 'status'),
    'plans': ('plan_id', 'data_limit_gb', 'data_refueling_price_per_gb'),
}

def account_facts(agent, data):
    db = agent.business_environment.tools.db
    args = data.get('args') or {}
    raw = agent.harness_results.get(data.get('call_id'))
    result = {}
    if raw is not None and not raw.error:
        try:
            value = json.loads(raw.content)
            if isinstance(value, dict): result = value
        except (ValueError, TypeError): pass
    customer_ids = {args.get('customer_id'), result.get('customer_id')}
    line_ids = {args.get('line_id'), result.get('line_id')}
    bill_ids = {args.get('bill_id'), result.get('bill_id')}
    plan_ids = {args.get('plan_id'), result.get('plan_id')}
    requested_id = args.get('id', '')
    if requested_id.startswith('C'): customer_ids.add(requested_id)
    if requested_id.startswith('L'): line_ids.add(requested_id)
    if requested_id.startswith('B'): bill_ids.add(requested_id)
    if requested_id.startswith('P'): plan_ids.add(requested_id)
    customers = [c for c in db.customers if c.customer_id in customer_ids]
    for customer in customers:
        line_ids.update(customer.line_ids)
        bill_ids.update(customer.bill_ids)
    line_ids.update(result.get('line_ids') or [])
    bill_ids.update(result.get('bill_ids') or [])
    lines = [line for line in db.lines if line.line_id in line_ids or
             (args.get('phone_number') and line.phone_number == args['phone_number'])]
    plan_ids.update(line.plan_id for line in lines)
    selected = {'customers': customers, 'lines': lines,
                'bills': [bill for bill in db.bills if bill.bill_id in bill_ids],
                'plans': [plan for plan in db.plans if plan.plan_id in plan_ids]}
    out = {'today': get_today().isoformat(), 'boundary': 'selected-account-records-only'}
    for name, rows in selected.items():
        out[name] = [{key: item.model_dump(mode='json').get(key) for key in FIELDS[name]} for item in rows]
    return out
