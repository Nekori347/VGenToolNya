/** Extract UI literal properties from public static JS. Never evaluate page code. */
export function decodeLiteral(raw:string){try{if(raw[0]==='"')return JSON.parse(raw);const body=raw.slice(1,-1);if(raw[0]==='`'&&body.includes('${'))return null;return body.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrt'"`\\])/g,(_,s)=>s[0]==='u'?String.fromCharCode(parseInt(s.slice(1),16)):s[0]==='x'?String.fromCharCode(parseInt(s.slice(1),16)):({n:'\n',r:'\r',t:'\t'}[s]||s))}catch{return null}}
export function extractUILiterals(code:string){
 const entries=new Map<string,string>();const props=/(?:\b(text|label|placeholder|title|children|heading|subtitle|emptyText|buttonText|description)|["'](text|label|placeholder|title|children|heading|subtitle|emptyText|buttonText|description|aria-label)["'])\s*:\s*/g;
 for(const match of code.matchAll(props)){
  const start=match.index+match[0].length;let depth=0;
  for(let i=start;i<Math.min(code.length,start+5000);i++){
   const c=code[i];if(depth===0&&',;}'.includes(c))break;
   if(c==='"'||c==="'"||c==='`'){let end=i+1;for(;end<code.length;end++){if(code[end]==='\\'){end++;continue}if(code[end]===c)break}const value=decodeLiteral(code.slice(i,end+1));i=end;if(typeof value!=='string')continue;const text=value.replace(/\s+/g,' ').trim();if(text.length>=2&&text.length<=350&&/[A-Za-z]/.test(text)&&!/^https?:|^data:/.test(text))entries.set(text,match[1]||match[2]);continue}
   if('([{'.includes(c))depth++;if(')]}'.includes(c)){if(!depth)break;depth--}
  }
 }
 return [...entries].map(([text,property])=>({text,property}));
}
export function publicAssetURL(value:string){try{const u=new URL(value);return !u.search&&!u.hash&&((u.origin==='https://vgen.co'&&/^\/_next\/static\/.+\.(?:js|json)$/.test(u.pathname))||(u.origin==='https://assets.vgen.co'&&/^\/[a-zA-Z0-9_-]+\/_next\/static\/.+\.(?:js|json)$/.test(u.pathname)))?u.href:null}catch{return null}}
