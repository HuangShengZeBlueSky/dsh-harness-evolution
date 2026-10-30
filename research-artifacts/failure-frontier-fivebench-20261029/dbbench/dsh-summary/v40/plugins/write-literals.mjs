export const name = 'write-literals';
export function apply(ctx) {
  ctx.on('benchmark/setup', async ({ac,audit},next) => {
    await next();
    ac.on('system-prompt/assemble', async (assembly,context,next) => {
      const result = await next();
      const text = 'For INSERT/UPDATE tasks, preserve explicitly requested text exactly: spaces inside parentheses, commas in numbers, percent signs, punctuation and Unicode dashes are data. Quote TEXT values as strings instead of silently converting them to numbers or standardizing dates. If the task says to match existing formats or a field representation is unclear, first SELECT a few relevant existing rows to learn that format. Preserve compound information in a cell (such as round scores plus total), rather than reducing it to one number. Map each requested value to the correct column; do not invent extra filter conditions.';
      audit({method_id:name,hook:'system-prompt/assemble',text});
      return {...result,sections:[...result.sections,{name,order:26,text,interpolate:false}]};
    });
  });
}
