export const name='sql-literals';
const quoted=/('(?:''|\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:``|[^`])*`)/g;
export function apply(ctx,config){
 ctx.on('benchmark/setup',async(p,next)=>{
  await next();const {ac,audit,getVisibleInput}=p;
  if(![p.taskContext?.type].flat().some(t=>/\b(INSERT|UPDATE|REPLACE)\b/i.test(String(t))))return;
  const formats=new Set(),denied=new Set();let normalize=false;
  const literal=n=>{
   const matches=[...formats].filter(f=>Number(f.replaceAll(',',''))===Number(n));
   if(matches.length===1)return matches[0];
   if(/^[+-]?0\d+/.test(n)||/\.\d*0$/.test(n))return n;
   return null;
  };
  const convert=(part,pattern)=>part.split(quoted).map((s,i)=>i%2?s:s.replace(pattern,(all,prefix,n)=>{const v=literal(n);return v===null?all:prefix+"'"+v+"'";})).join('');
  ac.on('system-prompt/assemble',async(a,c,next)=>{
   const r=await next();for(const m of getVisibleInput().messages||[]){if(typeof m.content==='string'&&m.content.includes('Question:')){
    const q=m.content.split('Question:').slice(1).join('Question:');normalize=/remove.*commas|strip.*commas|normalize|standardize.*numeric/i.test(q);
    for(const n of q.match(/\b(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d*0|0\d+)\b/g)||[])formats.add(n);
   }}
   if(!formats.size||normalize)return r;
   const text='TEXT write precision: preserve the user\'s formatted numeric values as SQL string literals. Bare numeric SQL literals may drop leading or trailing zeros. Requested formats: '+JSON.stringify([...formats])+'. Preserve these literal strings unless normalization was explicitly requested.';
   audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:48,text,interpolate:false}]};
  });
  ac.on('tools/pre-execute',async(call,next)=>{
   const d=await next();if(d.kind!=='allow'||call.name!=='execute_sql'||normalize)return d;
   const q=call.arguments.query;if(denied.has(q))return d;
   const mask=q.replace(quoted,s=>' '.repeat(s.length));let fixed=q;
   if(/^\s*INSERT\b/i.test(q)){
    const v=/\bVALUES\b/i.exec(mask);if(v){const at=v.index+v[0].length;fixed=q.slice(0,at)+convert(q.slice(at),/([,(]\s*)([+-]?\d+(?:\.\d+)?)(?=\s*[,)])/g);}
   }else if(/^\s*UPDATE\b/i.test(q)){
    const s=/\bSET\b/i.exec(mask);if(s){const at=s.index+s[0].length,w=/\bWHERE\b/i.exec(mask.slice(at)),end=w?at+w.index:q.length;fixed=q.slice(0,at)+convert(q.slice(at,end),/(=\s*)([+-]?\d+(?:\.\d+)?)(?=\s*(?:,|;?\s*$))/g)+q.slice(end);}
   }
   if(fixed===q)return d;denied.add(q);const reason='Preserve the requested TEXT value format rather than numeric coercion. Reissue execute_sql with query: '+fixed;
   audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return {kind:'deny',reason};
  });
 });
}
