import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
let count=0;
for(const bench of fs.readdirSync('harnesses'))for(const release of fs.readdirSync('harnesses/'+bench)){
 const root=path.resolve('harnesses',bench,release);
 const c=JSON.parse(fs.readFileSync(root+'/composition.json'));
 for(const method of c.methods){
  const m=await import(pathToFileURL(path.resolve(root,method.module)).href);
  if(m.name!==method.id||typeof m.apply!=='function')throw Error('Invalid plugin export: '+method.id);
  count++;
 }
 console.log(`${bench}/${release}: ${c.methods.length} modules import successfully`);
}
console.log(`${count} module registrations checked; this is not a benchmark rerun.`);
