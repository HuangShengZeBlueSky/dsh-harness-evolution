import {installRewrite} from './rewrite-stream.mjs';
export const name='line-content-contract';
export function apply(ctx){
 installRewrite(ctx,name,(script,{task})=>{
  if(!/\b(?:count|number|how many|total)\b[\s\S]*?\blines\b/i.test(task)||/\b(?:unique|distinct|contain|containing|matching|match|excluding|exclude)\b/i.test(task))return script;
  const m=script.match(/^\s*(find\s+[^|;]+?)\s*\|\s*wc\s+-l\s*$/);
  if(!m||/\s-(?:exec|execdir|printf|print0)\b/.test(m[1]))return script;
  const select=m[1]+(/\s-type\s+f\b/.test(m[1])?'':' -type f');
  return select+" -exec awk '1' {} + | wc -l";
 },'Content-line total: find lists file paths. The selected regular files are now actually read as records before counting; original scope and symbolic-link exclusions remain in the selection.');
}
