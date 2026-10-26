export const name = 'household-procedure';
export function apply(ctx) {
  ctx.on('benchmark/setup', async (payload, next) => {
    await next();
    const { ac, audit } = payload;
    ac.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next();
      const text = `Household task procedure:
Use take_action({"action":"one exact line from the latest AVAILABLE ACTIONS"}) every turn. The listed actions are argument values, not tool names. Do not invent commands or claim completion in plain text. The environment ends the episode on success; if it keeps responding, keep working on missing requirements.
Match the exact object type in the original task: cup is not mug, pan is not pot, soapbottle is not soapbar, cloth is not handtowel. Do not substitute similar objects. Keep searching for the requested type.
To move an object: go to its location, open the container if closed, take the exact object from the listed source, go to the destination, open it if needed, then use the listed put OBJECT in/on DESTINATION command. Merely seeing or examining an object does not pick it up. You can carry one object at a time.
A clean/hot/cool object must be processed. First take it, then go to sinkbasin/microwave/fridge respectively, select the listed clean/heat/cool OBJECT with APPLIANCE action, and then carry it to the task destination and put it there. Simply placing it in an appliance or finding an ordinary object does not satisfy processing. After processing you still hold the object.
For look at/examine an object under/with a lamp: take the requested object, carry it to the lamp's location, and use the lamp while holding the object. Examining the object alone or using the lamp with empty hands does not accomplish this task.
For two objects: deliver two distinct instances of the exact type to the same destination, one at a time. Do not take back the first delivered object.
Search efficiently: inspect surfaces and open closed containers. A closed container has not been searched. Remember places already searched and target objects seen. When a target take action is available, take it instead of examining or leaving it. Avoid repeated look, inventory and examine actions that add no information. Never declare the task impossible while unsearched locations remain.`;
      audit({ method_id: name, hook: 'system-prompt/assemble', call_id: null, text });
      return { ...result, sections: [...result.sections, { name, order: 25, text, interpolate: false }] };
    });
  });
}
