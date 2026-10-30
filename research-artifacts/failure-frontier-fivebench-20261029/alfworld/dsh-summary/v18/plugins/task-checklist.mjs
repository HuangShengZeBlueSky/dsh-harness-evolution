export const name = 'task-checklist';
export function apply(ctx) {
 ctx.on('benchmark/setup', async ({ac,audit,getVisibleInput},next) => {
  await next(); let goal='';
  ac.on('system-prompt/assemble',async (assembly,context,next)=>{
   const result=await next();
   if(!goal) for(const m of getVisibleInput().messages){const x=String(m.content||'').split(' AVAILABLE ACTIONS:')[0].match(/Your task is to:\s*([^\n]+)/i);if(x){goal=x[1].trim();break;}}
   let steps='Take the exact requested object, carry it to the destination, and use the available put action.';
   if(/lamp/.test(goal))steps='Take the requested object, carry it to the lamp, and use the lamp while holding the object. Search for the lamp if its location is not yet known.';
   else if(/\b(hot|heat)\b/.test(goal))steps='Take the requested object, go to microwave, use heat OBJECT with microwave, then carry and put it at the destination.';
   else if(/\b(cold|cool)\b/.test(goal))steps='Take the requested object, go to fridge, use cool OBJECT with fridge, then carry and put it at the destination.';
   else if(/\bclean\b/.test(goal))steps='Take the requested object, go to sinkbasin, use clean OBJECT with sinkbasin, then carry and put it at the destination.';
   if(/\bsliced\b/.test(goal))steps='To make a sliced object, take a knife or butterknife, go to the object and use an available slice action while holding the knife. Put the knife down, then take the sliced object. '+steps;
   if(/\btwo\b/.test(goal))steps+=' Deliver two different numbered instances to the same destination one at a time; leave the first delivered object there.';
   const text=`Current task: ${goal}\n${steps}\nUse take_action with an exact action from AVAILABLE ACTIONS. Match the precise object type and number. Seeing an object does not put it in inventory; only a pick-up receipt does. A put receipt does not confirm cleaning/heating/cooling. When the interaction continues, inspect the missing requirement rather than declare completion.`;
   audit({method_id:name,hook:'system-prompt/assemble',text});
   return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
  });
 });
}
