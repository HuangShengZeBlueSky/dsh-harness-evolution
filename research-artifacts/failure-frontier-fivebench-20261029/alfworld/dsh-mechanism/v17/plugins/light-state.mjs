export const name = 'light-state';
const textOf = x => typeof x === 'string' ? x : Array.isArray(x) ? x.map(c=>c.text||'').join('\n') : '';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload,next)=> {
    await next();
    const {ac,agent,audit,getRawBusinessResult,getVisibleInput}=payload;
    let goal='', held='', targetPlace='', lampPlace='', current='';
    const checked=new Set();
    function init(){
      if(goal) return;
      const input=getVisibleInput();
      const messages=input?.messages||[];
      const events=agent.session.snapshotEvents();
      const source=messages.map(m=>textOf(m.content)).join('\n')+'\n'+events.filter(e=>e.type==='user/message').map(e=>textOf(e.data?.content)).join('\n');
      const task=source.match(/Your task is to:\s*([^\n.]+)/i)?.[1]||'';
      const m=task.match(/(?:look at|examine)\s+(?:the\s+|a\s+)?(\w+)\s+(?:under|with)\s+(?:the\s+)?desklamp/i);
      if(m)goal=m[1].toLowerCase();
    }
    ac.on('system-prompt/assemble', async (assembly,context,next)=>{
      const result=await next(); init();
      if(!goal)return result;
      const text=`Light task: the target is ${goal}. Take the exact target object into your inventory, then go to the observed desklamp location and use the desklamp while holding the target. Merely examining the object or turning on the lamp empty-handed leaves the task unfinished. Search new locations if needed; select exact AVAILABLE ACTIONS and keep calling take_action.`;
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
    ac.on('tools/post-execute',async(call,result,next)=>{
      const decision=await next();init();
      if(decision.kind!=='accept'||!goal)return decision;
      const raw=getRawBusinessResult(call.callId);
      const full=textOf(raw?.content)||textOf(result.content);
      const [obs,available='']=full.split('AVAILABLE ACTIONS:');
      const actions=available.split('\n').map(s=>s.trim()).filter(Boolean);
      let m=obs.match(/You pick up the (\w+ \d+) from the (\w+ \d+)/i);
      if(m){held=m[1];if(held.startsWith(goal+' '))targetPlace='';}
      m=obs.match(/You put the (\w+ \d+) in\/on the (\w+ \d+)/i);
      if(m){if(held===m[1])held='';if(m[1].startsWith(goal+' '))targetPlace=m[2];}
      if(/You are not carrying anything/i.test(obs))held='';
      m=obs.match(/You are carrying:\s*(?:a |an )?(\w+ \d+)/i);if(m)held=m[1];
      m=obs.match(/(?:On the|In the) (\w+ \d+), you see/i)||obs.match(/The (\w+ \d+) is (?:open|closed)/i)||obs.match(/You open the (\w+ \d+)/i);
      if(m){current=m[1];if(!/is closed/.test(obs))checked.add(current);}
      if(current&&new RegExp('\\b'+goal+' \\d+').test(obs)&&!/You (pick up|put)/.test(obs))targetPlace=current;
      if(current&&/\bdesklamp \d+/.test(obs)&&!/turn on/.test(obs))lampPlace=current;
      const exactTake=actions.find(a=>a.startsWith('take '+goal+' '));
      let action='';
      if(held.startsWith(goal+' ')){
        action=actions.find(a=>/^use desklamp \d+$/.test(a))|| (lampPlace&&actions.find(a=>a==='go to '+lampPlace))||'';
      } else action=exactTake||(targetPlace&&actions.find(a=>a==='go to '+targetPlace))||'';
      if(!action){
        action=actions.find(a=>/^open /.test(a))||actions.find(a=>a.startsWith('go to ')&&!checked.has(a.slice(6)))||'';
      }
      const annotation=`Light task state: target=${goal}; carrying=${held||'nothing confirmed'}; target location=${targetPlace||'unknown'}; lamp location=${lampPlace||'unknown'}. ${action?'Next useful available action: '+action+'. ':''}Take the target, then use the lamp while holding it. Do not substitute examine or declare completion without doing this.`;
      audit({method_id:name,hook:'tools/post-execute',call_id:call.callId,annotation});
      return {...decision,content:[...(decision.content||result.content),{type:'text',text:annotation}]};
    });
  });
}
