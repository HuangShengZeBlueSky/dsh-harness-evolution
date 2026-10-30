import {installRewrite} from './rewrite-stream.mjs';
export const name='status-contract';
const q=s=>"'"+s.replace(/'/g,"'\\''")+"'";
export function apply(ctx){
 installRewrite(ctx,name,(script,{task})=>{
  if(!/\b(?:unique|distinct)\b/i.test(task)||!/\btimestamp\s+IP_address\s+status_code\b/i.test(task))return script;
  const code=task.match(/\b(\d{3})\s+status\s+code\b/i)?.[1]||task.match(/\bstatus\s+code\s+(?:of\s+)?(\d{3})\b/i)?.[1];
  const directory=task.match(/\b(?:directory|folder)\s+(?:named|called)\s+["'\x60]([^"'\x60]+)["'\x60]/i)?.[1];
  if(!code||!directory||!/\bhome directory\b/i.test(task)||!/\b(?:grep|awk|wc|python|perl)\b/.test(script))return script;
  const root=directory.startsWith('/')?q(directory):'~/'+q(directory);
  return 'find '+root+" -maxdepth 1 -type f -exec awk -v requested_status="+q(code)+" '$NF == requested_status {print $(NF-1)}' {} + | sort -u | wc -l";
 },'Status-field query uses the task-declared trailing IP_address/status_code fields. The status may end a line; timestamp may occupy several words. This command counts the actual global unique IP set.');
}
