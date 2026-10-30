export function sqlTokens(sql){return [...sql.matchAll(/'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"|`(?:``|[^`])*`|[(),;]|[^\s(),;]+/g)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));}
export function commaParts(list){const result=[];let part=[],depth=0;for(const token of list){if(token.text==='(')depth++;if(token.text===')')depth--;if(token.text===','&&depth===0){result.push(part);part=[];}else part.push(token);}result.push(part);return result;}
export function insertCells(sql){
 if(!/^\s*INSERT\s+INTO\b/i.test(sql))return null;
 const tokens=sqlTokens(sql);
 const close=start=>{let depth=0;for(let i=start;i<tokens.length;i++){if(tokens[i].text==='(')depth++;else if(tokens[i].text===')'&&--depth===0)return i;}return -1;};
 const parts=list=>{const result=[];let part=[],depth=0;for(const token of list){if(token.text==='(')depth++;if(token.text===')')depth--;if(token.text===','&&depth===0){result.push(part);part=[];}else part.push(token);}result.push(part);return result;};
 const open=tokens.findIndex(t=>t.text==='(');if(open<0)return null;const end=close(open);if(end<0||tokens[end+1]?.text.toUpperCase()!=='VALUES')return null;
 const columns=parts(tokens.slice(open+1,end));if(columns.some(c=>c.length!==1))return null;const names=columns.map(c=>c[0].text.replace(/^`|`$/g,'').replace(/``/g,'`'));const cells=[];
 let at=end+2;while(tokens[at]?.text==='('){const stop=close(at);if(stop<0)return null;const values=parts(tokens.slice(at+1,stop));if(values.length!==names.length)return null;
  for(let i=0;i<values.length;i++)if(values[i].length===1)cells.push({column:names[i],...values[i][0]});
  at=stop+1;if(tokens[at]?.text===',')at++;else break;
 }return cells;
}
