export const name='numeric-text';
export function apply(ctx,config){ctx.on('benchmark/setup',async(p,next)=>{await next();const {ac,audit}=p;const info=p.taskContext?.table?.table_info;let used=false;
ac.on('tools/pre-execute',async(call,next)=>{const d=await next();if(d.kind!=='allow'||used||call.name!=='execute_sql'||!info)return d;const q=call.arguments.query||'';let fixed=q,examples=[];
for(let i=0;i<info.columns.length;i++){const values=info.rows.map(r=>String(r[i]??'')).filter(Boolean);if(!values.length||!values.some(v=>v.includes(','))||!values.every(v=>/^[+-]?\d[\d,]*(?:\.\d+)?$/.test(v)))continue;
const col=info.columns[i].name,escaped=col.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),token='(?:`'+escaped+'`|(?<![\\w\x27\x22`])'+escaped+'(?![\\w\x27\x22`]))';const convert=s=>"CAST(REPLACE("+s+", ',', '') AS DECIMAL(30,8))";
fixed=fixed.replace(new RegExp('('+token+')(\\s*(?:>=|<=|>|<)\\s*[\x27\x22]?[+-]?\\d)','gi'),(_,c,tail)=>convert(c)+tail);
fixed=fixed.replace(new RegExp('(\\bORDER\\s+BY\\s+)('+token+')','gi'),(_,head,c)=>head+convert(c));
fixed=fixed.replace(new RegExp('(\\b(?:MAX|MIN|SUM|AVG)\\s*\\(\\s*)('+token+')(\\s*\\))','gi'),(_,head,c,tail)=>head+convert(c)+tail);
if(fixed!==q)examples.push([col,values.slice(0,3)]);
}if(fixed===q)return d;used=true;const reason='Public numeric TEXT cells contain thousands separators: '+JSON.stringify(examples)+'. MySQL implicit numeric conversion stops at the comma, while raw TEXT ordering is lexical. Keep all predicates and requested values; convert the numeric expression before comparison/order/aggregation. Candidate SQL:\n'+fixed;audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};});});}
