export const name='time-skill';
export function apply(ctx){ctx.on('benchmark/setup',async(p,next)=>{await next();let task='';
 p.ac.on('system-prompt/assemble',async(a,c,next)=>{const r=await next();
 if(!task)task=p.getVisibleInput().messages.filter(m=>m.role==='user').map(m=>m.content||'').join('\n');
 if(!/timestamp|unique (?:date|day)|last entry|most recent date/i.test(task))return r;
 const text='TIME DATA SKILL: Inspect head/tail of the actual files before choosing timestamp fields or a regex. Dates may use a space or T separator, or brackets. Empty regex output is not proof of empty files. For a count after the last entry of another file, read that last entry, extract its timestamp, then compare each target timestamp strictly greater than it; merely counting all timestamp-shaped lines is wrong. Consistent ISO timestamps can be compared lexically. For unique days, extract only YYYY-MM-DD, suppress filename prefixes with grep -h, then sort -u and count. Do not suppress parse errors into a fabricated zero.';
 p.audit({method_id:name,hook:'system-prompt/assemble',text});return {...r,sections:[...r.sections,{name,order:27,text,interpolate:false}]};
 });
});}
