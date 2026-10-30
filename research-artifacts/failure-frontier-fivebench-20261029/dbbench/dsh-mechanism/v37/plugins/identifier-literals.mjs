export const name='identifier-literals';
export function apply(ctx){
  ctx.on('benchmark/setup',async(p,next)=>{
    await next();
    const {ac,agent,audit,getRawBusinessResult}=p;
    let warned=false,constantNoted=false;
    const identifiers=()=>{
      for(const e of agent.session.snapshotEvents()){
        if(e.type!=='user/message')continue;
        const text=(e.data.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
        const line=text.split('\nQuestion:')[0];
        const match=line.match(/The name of this table is (.*?), and the headers of this table are ([\s\S]*)\.$/);
        if(match)return new Set([match[1],...match[2].split(',').map(x=>x.trim())]);
      }
      return new Set();
    };
    ac.on('tools/post-execute',async(call,result,next)=>{
      const d=await next();
      if(d.kind!=='accept'||call.name!=='execute_sql'||constantNoted)return d;
      const a=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const r=getRawBusinessResult(call.callId),text=String(r?.content||'');
      if(!r||r.error||/^\s*\d{4}\s*\([A-Z0-9]+\):/.test(text)||!/^\s*SELECT\b/i.test(a.query))return d;
      const known=identifiers(),literal=[];
      for(const m of a.query.matchAll(/'(?:''|\\.|[^'])*'|`(?:``|[^`])*`|"([^"]+)"/g))if(m[1]&&known.has(m[1])&&text.includes(m[1]))literal.push(m[1]);
      if(!literal.length)return d;
      constantNoted=true;
      const annotation='Constant projection is not data evidence: the query still double-quotes public schema identifiers '+JSON.stringify(literal)+', and the result echoes those names as literal strings. Those values are NOT the stored field contents and cannot establish that requested data is absent. Re-query the actual columns with MySQL backticks, preserving string values in single quotes; then apply the task conditions to observed data.';
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...d,content:[...(d.content||result.content),{type:'text',text:'\n'+annotation}]};
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();
      if(decision.kind!=='allow'||call.name!=='execute_sql'||warned)return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      const known=identifiers(),wrong=[];
      for(const match of args.query.matchAll(/'(?:''|\\.|[^'])*'|`(?:``|[^`])*`|"([^"]+)"/g)){
        if(match[1]&&known.has(match[1]))wrong.push(match[1]);
      }
      if(!wrong.length)return decision;
      warned=true;
      const reason='MySQL quoting correction: '+wrong.map(x=>'"'+x+'"').join(', ')+' matches the public schema but is double-quoted. Double quotes here produce string constants, not column identifiers, so the query can silently return no rows or repeat the column name. Rewrite those identifiers using backticks (`name`) and execute the corrected query. Preserve actual string values in single quotes.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});
      return {kind:'deny',reason};
    });
  });
}
