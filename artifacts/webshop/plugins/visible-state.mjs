export const norm=s=>String(s||'').toLowerCase().trim();
const accessoryWords=/\b(cables?|chargers?|adapters?|cases?|covers?|bands?|straps?|protectors?|holders?|stands?|mounts?|docks?)\b/;
export function requestedDevice(instruction){
 const text=norm(instruction);if(accessoryWords.test(text))return '';
 const type=text.match(/\b(smartphone|phone|tablet|laptop|camera|watch)(?:es|s)?\b/)?.[1]||'';
 return type==='smartphone'?'phone':type;
}
export function accessoryEvidence(title){
 const prefix=norm(title).split(/\b(?:compatible (?:with|for)|for use with|for|fits)\b/)[0].split(',')[0];
 const role=prefix.match(accessoryWords)?.[0];return role?{role,prefix}:null;
}
export function initialObservation(agent){
 for(const e of agent.session.snapshotEvents())if(e.type==='user/message'||e.name==='user/message'){
  const c=e.data?.content;if(Array.isArray(c))return c.filter(b=>b.type==='text').map(b=>b.text).join('\n');
 }
 return '';
}
export function actions(raw){
 const tail=raw.split('Available Actions:').at(-1);
 const list=tail.match(/['"]clickables['"]:\s*\[([\s\S]*)\]/)?.[1]||'';
 return [...list.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g)].map(m=>norm((m[1]??m[2]).replace(/\\(['"\\])/g,'$1')));
}
export function rawText(result,receipt){return typeof receipt?.content==='string'?receipt.content:result.content.filter(b=>b.type==='text').map(b=>b.text).join('\n');}
export function productGroups(raw){
 const obs=raw.split('Available Actions:')[0];if(!/\[SEP\]\s*Buy Now/i.test(obs))return [];
 const parts=obs.split('[SEP]').map(norm),start=parts.indexOf('< prev')+1,end=parts.findIndex((s,i)=>i>=start&&/^price:/.test(s));
 if(start<1||end<0)return [];
 const clickable=new Set(actions(raw));const groups=[];let group;
 for(let i=start;i<end-1;i++){
  if(!clickable.has(parts[i])){group={label:parts[i],values:[]};groups.push(group);}
  else if(group)group.values.push(parts[i]);
 }
 return groups.filter(g=>g.values.length);
}

export const wantsHotCocoa=instruction=>/\bhot (?:chocolate|cocoa)\b/i.test(instruction);
export function cocoaTitleRole(title){
 const text=norm(title);
 if(/\b(?:hot (?:chocolate|cocoa)|cocoa (?:mix|classics))\b/.test(text))return 'cocoa drink';
 return text.match(/\b(granola|cookies?|popcorn|(?:fudge )?sauce|protein bites?)\b/)?.[1]||'';
}

export function dimensions3(value){
 const text=norm(value).replace(/inches|inch/g,'in').replace(/feet|foot/g,'ft').replace(/[“”]/g,'"');
 const m=text.match(/(?:^|[^a-z0-9.])(\d+(?:\.\d+)?)\s*(ft|in|cm|")?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(ft|in|cm|")?\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)\s*(ft|in|cm|")?/);
 if(!m)return null;
 const units=[m[2],m[4],m[6]].filter(Boolean).map(u=>u==='"'?'in':u);
 if(new Set(units).size>1)return null;
 const sides=[m[1],m[3],m[5]].map(Number),unit=units[0]||'';
 return {sides,unit,key:sides.join('x')+'x'+unit};
}

export const ingredientTokens=value=>norm(value).replace(/[^a-z]+/g,' ').split(/\s+/).filter(Boolean).map(w=>w.length>3&&w.endsWith('s')?w.slice(0,-1):w);
export function readyIngredientPair(instruction){
 const match=norm(instruction).match(/\bready(?:\s+to)?\s+eat\s+(?:in\s+)?([a-z]+)\s*(?:&|and)\s*([a-z]+)\b/);
 if(!match)return [];
 const pair=ingredientTokens(match[1]+' '+match[2]);
 return new Set(pair).size===2?pair:[];
}

export function eyelashSpecGoal(instruction){
 const text=norm(instruction);if(!/\beyelash extensions?\b/.test(text))return null;
 const diameter=text.match(/\b(\d+(?:\.\d+)?)\s*(?:millimeters?|mm)\s+(?:in\s+)?diameter\b/);
 const range=text.match(/\b(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(?:millimeters?|mm)\s+long\b/);
 return diameter&&range?{diameter:Number(diameter[1]),low:Number(range[1]),high:Number(range[2])}:null;
}
export function eyelashVariant(value){
 const match=norm(value).match(/^(\d+(?:\.\d+)?)[ -]+([a-z]{1,2})[ -]+(?:mix[ -]*)?(\d+(?:\.\d+)?)(?:[ -]+(\d+(?:\.\d+)?))?mm$/);
 return match?{diameter:Number(match[1]),curl:match[2],low:Number(match[3]),high:Number(match[4]||match[3])}:null;
}
export function matchesEyelashSpec(value,goal){
 const choice=eyelashVariant(value);return !!choice&&!!goal&&choice.diameter===goal.diameter&&choice.low===goal.low&&choice.high===goal.high;
}

export function fortuneCookieGoal(instruction){
 const text=norm(instruction);if(!/\bfortune cookies?\b/.test(text))return null;
 const pattern=text.match(/\bpattern(?:\s+name)?\s*(?::|is)\s*([^,.;]+)/)?.[1]?.trim()||'';
 return {pattern};
}
export function fortuneCookieRole(title){
 const text=norm(title);
 if(/\bfortune cookies?\b/.test(text))return 'fortune cookies';
 if(/\b(?:brew glitter|edible (?:brew )?glitter|sugar decorations?|edible powder|edible dust)\b/.test(text))return 'edible decoration';
 return '';
}

export const gbCapacities=value=>[...new Set([...norm(value).matchAll(/\b(\d+(?:\.\d+)?)\s*(?:gb|gigabytes?)\b/g)].map(m=>Number(m[1])))];
export function flashDriveGoal(instruction){
 const text=norm(instruction);if(!/\b(?:pen|flash|thumb|jump|zip)\s*drive\b|\bpendrive\b/.test(text))return null;
 const values=gbCapacities(text);return values.length===1?{gb:values[0]}:null;
}
export function flashDriveTitleRole(title){
 const text=norm(title);
 if(/\b(?:desktop|laptop) computer\b/.test(text))return 'computer';
 if(/\b(?:micro\s*sd|sd|tf) (?:memory )?card\b|\bmemory card\b/.test(text))return 'memory card';
 if(/\b(?:pen|flash|thumb|jump|zip)\s*drive\b|\bpendrive\b|\bmemory stick\b/.test(text))return 'USB flash drive';
 return '';
}
export const matchesFlashCapacity=(value,goal)=>{const capacities=gbCapacities(value);return !!goal&&capacities.length===1&&capacities[0]===goal.gb;};

export const foodPhrase=value=>norm(value).replace(/[-–—]+/g,' ').replace(/\s+/g,' ').trim();
export function truffleGoal(instruction){
 const text=foodPhrase(instruction);
 return /\btruffles?\b/.test(text)&&! /\btruffle (?:oil|salt|pasta|sauce)\b/.test(text)?{sugarFree:/\bsugar free\b/.test(text)}:null;
}
export function truffleTitleRole(title){
 const text=foodPhrase(title);
 if(/\btruffle (?:oil|salt|pasta|sauce)\b/.test(text))return '';
 if(/\btruffles?\b/.test(text))return 'truffle confection';
 if(/\bsyrups?\b/.test(text))return 'flavoring syrup';
 return '';
}
export function truffleFlavorMatches(values,instruction){
 const task=' '+foodPhrase(instruction)+' ';
 const hits=values.filter(value=>foodPhrase(value).length>=3&&task.includes(' '+foodPhrase(value)+' '));
 return hits.filter(value=>!hits.some(other=>other!==value&&(' '+foodPhrase(other)+' ').includes(' '+foodPhrase(value)+' ')));
}

export function namedPerfumeGoal(instruction){
 const m=norm(instruction).match(/\b(\d+(?:\.\d+)?\s+(?:fluid\s+(?:ounces?|oz|out)|fl\s*oz))\s+([a-z][a-z0-9-]*)\s+perfume\b/);
 return m?{name:m[2],writtenVolume:m[1]}:null;
}
export function perfumeTitleRole(title){
 const text=norm(title);
 if(/\b(?:eau de (?:toilette|parfum)|perfumes?|cologne|body oils?)\b/.test(text))return 'fragrance product';
 if(/\b(?:toothpaste|nail polish|lipstick)\b/.test(text))return 'other cosmetic';
 return '';
}
export const containsPerfumeName=(value,goal)=>!!goal&&(' '+norm(value).replace(/[^a-z0-9]+/g,' ')+' ').includes(' '+goal.name.replace(/-/g,' ')+' ');
export const visiblePerfumeVolumes=value=>[...new Set([...norm(value).matchAll(/\b\d+(?:\.\d+)?\s*(?:fl\s*(?:oz|ounces?)|fluid\s*ounces?|ml|milliliters?)\b/g)].map(m=>m[0]))];

export function explicitFlavor(instruction){
 return norm(instruction).match(/(?:want|need|in|choose|pick)\s+([a-z]+(?:[ -]+(?:and|[a-z]+)){0,3})\s+flavo[u]?r\b/)?.[1]||'';
}

export const flavorKey=value=>norm(value).replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\band\b/g," ").replace(/\s+/g," ").trim();
