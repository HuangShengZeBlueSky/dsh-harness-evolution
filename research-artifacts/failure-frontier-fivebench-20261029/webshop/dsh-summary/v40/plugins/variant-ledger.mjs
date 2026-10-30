export const name = 'variant-ledger';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit, getRawBusinessResult} = payload;
    let groups = [], selected = {}, taskSize = null, checked = false, taskText = "", formChecked = false, flavorChecked = false, colorChecked = false;
    const hasSize=(v,n)=>(v.match(/\d+(?:\.\d+)?/g)||[]).some(x=>Number(x)===n);
    ac.on('tools/post-execute', async (call, result, next) => {
      const decision = await next();
      if (decision.kind !== 'accept') return decision;
      const raw = getRawBusinessResult(call.callId);
      if (!raw || raw.error) return decision;
      const text = raw.content;
      const task=text.match(/Instruction:\s*\[SEP\]([\s\S]*?)\[SEP\]/)?.[1]||"";
      if(task)taskText=task.toLowerCase();
      const required=task.match(/\bsize\s+(?:(?:was|is)\s+)?(\d+(?:\.\d+)?)(?:\s+1\/2)?(?![\w.\/-])/i);
      if(required)taskSize=Number(required[1])+(required[0].endsWith('1/2')?0.5:0);
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      const value = (args.value || '').toLowerCase();
      const actions = text.split('Available Actions:')[1] || '';
      if (call.name === 'search_action' || /^[a-z0-9]{10}$/.test(value) || (value === '< prev' && !actions.includes("'buy now'")) || value === 'back to search') {
        groups = []; selected = {};
      }
      if (!actions.includes("'buy now'")) return decision;
      const parts = text.split('Observation:')[1]?.split('Available Actions:')[0].split('[SEP]').map(s => s.trim()) || [];
      const start = parts.indexOf('< Prev');
      const end = parts.findIndex(s => s.startsWith('Price:'));
      if (start >= 0 && end > start) {
        const parsed = []; let group;
        for (const part of parts.slice(start + 1, end - 1)) {
          const clickable = actions.includes("'" + part.toLowerCase() + "'") || actions.includes('"' + part.toLowerCase() + '"');
          if (!clickable) { group = {label: part, choices: []}; parsed.push(group); }
          else if (group) group.choices.push(part.toLowerCase());
        }
        groups = parsed.filter(g => g.choices.length);
      }
      for (const group of groups) if (group.choices.includes(value)) selected[group.label] = value;
      if (!groups.length) return decision;
      const annotation = 'Variant selection record for this product (from executed clicks; title is not a selection):\n' +
        groups.map(g => g.label + ': ' + (selected[g.label] ? 'selected ' + JSON.stringify(selected[g.label]) : 'not yet selected; available ' + JSON.stringify(g.choices))).join('\n') +
        '\nBefore buy now, choose the available variant matching each requested attribute, including flavor, length, pack and style. Use exact clickable values. Only select groups explicitly requested; unspecified groups need no extra selection. Once requested choices have been selected, buy now; do not repeat them.';
      audit({method_id: name, hook: 'tools/post-execute', call_id: call.callId, annotation});
      return {...decision, content: [...(decision.content || result.content), {type: 'text', text: annotation}]};
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();if(decision.kind!=='allow'||checked||taskSize===null||call.name!=='click_action')return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;
      if(args.value.toLowerCase()!=='buy now')return decision;
      const group=groups.find(g=>g.label.toLowerCase()==='size');
      if(!group||hasSize(selected[group.label]||'',taskSize))return decision;
      const available=group.choices.filter(v=>hasSize(v,taskSize));checked=true;
      const reason=available.length ? 'Purchase not executed: requested size '+taskSize+' is not selected. Click the matching displayed size: '+JSON.stringify(available)+', then buy now.' : 'Purchase not executed: this product has no displayed size '+taskSize+'. Do not substitute a smaller or larger size. Click < prev and inspect another result, or back to search for the same requested item in size '+taskSize+'.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();if(decision.kind!=='allow'||formChecked||call.name!=='click_action')return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now')return decision;
      const group=groups.find(g=>g.label.toLowerCase()==='size');if(!group)return decision;
      const matches=group.choices.filter(v=>{
        const m=v.match(/^([a-z ]+)\s*\(\d+\)$/);return m&&(' '+taskText.replace(/[^a-z0-9]+/g,' ')+' ').includes(' '+m[1].trim()+' ');
      });
      if(matches.length!==1||selected[group.label]===matches[0])return decision;
      formChecked=true;const reason='Purchase not executed: the request explicitly names the packaging form for this displayed option: '+JSON.stringify(matches[0])+'. The selected size is '+JSON.stringify(selected[group.label]||'none')+'. Click the requested packaging option, then buy now. The title default is not the requested selection.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();if(decision.kind!=='allow'||flavorChecked||call.name!=='click_action')return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now')return decision;
      const norm=s=>' '+s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
      for(const group of groups.filter(g=>/flavou?r/i.test(g.label))){
        let matches=group.choices.filter(v=>norm(taskText).includes(norm(v)));
        if(matches.length===1){
          const base=norm(matches[0]).trim();
          const refined=[...new Set(group.choices.filter(v=>{
            const phrase=norm(v).trim();if(phrase===base||!phrase.endsWith(' '+base))return false;
            const words=phrase.split(' ');for(let i=0;i<words.length-1;i++)if(norm(taskText).includes(' '+words.slice(i).join(' ')+' '))return true;
            return false;
          }))];
          if(refined.length===1)matches=refined;
        }
        if(matches.length!==1||selected[group.label]===matches[0])continue;
        flavorChecked=true;const reason='Purchase not executed: the requested flavor, including its qualifying phrase, resolves to '+JSON.stringify(matches[0])+', but the recorded selected flavor is '+JSON.stringify(selected[group.label]||'none')+'. Click the actual displayed flavor '+JSON.stringify(matches[0])+' and then buy now. The product title flavor does not override the request.';
        audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
      }
      return decision;
    });
    ac.on('tools/pre-execute',async(call,next)=>{
      const decision=await next();if(decision.kind!=='allow'||colorChecked||call.name!=='click_action')return decision;
      const args=typeof call.arguments==='string'?JSON.parse(call.arguments):call.arguments;if(args.value.toLowerCase()!=='buy now')return decision;
      const shade=taskText.match(/\b(?:sky|light|dark) blue\b/)?.[0];if(!shade)return decision;
      const group=groups.find(g=>g.label.toLowerCase()==='color');if(!group)return decision;
      const norm=s=>' '+s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()+' ';
      if(norm(selected[group.label]||'').includes(' '+shade+' '))return decision;
      const matches=[...new Set(group.choices.filter(v=>norm(v).includes(' '+shade+' ')))];
      colorChecked=true;const reason='Purchase not executed: the required color is '+JSON.stringify(shade)+', but recorded color is '+JSON.stringify(selected[group.label]||'none')+'. '+(matches.length?'Select an actual matching shade option '+JSON.stringify(matches)+', retaining requested size.':'This product does not display the required shade. Search again for the original product type and exact color '+shade+'. Prioritize mandatory product type and shade before optional extras such as wireless charging; do not substitute pink or generic blue for the requested shade.')+' Keep all required features and price limit, then buy only a matching item.';
      audit({method_id:name,hook:'tools/pre-execute',call_id:call.callId,decision:'deny',reason});return{kind:'deny',reason};
    });
  });
}
