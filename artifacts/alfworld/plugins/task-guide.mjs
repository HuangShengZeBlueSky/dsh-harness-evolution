export const name = 'task-guide';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const {ac, audit} = payload;
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const text = `Household task procedure:
- Match the EXACT object name in the task: cup is not mug, soapbottle is not soapbar, cloth is not handtowel, pan is not pot. Keep searching for the requested type.
- First find and TAKE the requested object using a listed take action. A clean/hot/cool object must be created: carry it to sinkbasin/microwave/fridge and execute clean/heat/cool, then carry it to the destination and PUT it there. An object already at the destination still needs these operations.
- To look at an object under a lamp: TAKE the object, carry it to the surface with the requested lamp, then USE that lamp while holding the object. Do not put the object down first.
- For two objects: take and place one, then find a DIFFERENT numbered object of the same requested type and place it in the SAME destination.
- Search new surfaces and open closed containers. A go-to/open receipt already lists contents; avoid redundant look, examine and inventory. Remember searched locations and visible target locations.
- Every turn call take_action with one current available action. A prose claim does not finish the task; continue correcting unmet requirements until the environment ends the episode.`;
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:25,text,interpolate:false}]};
    });
  });
}
