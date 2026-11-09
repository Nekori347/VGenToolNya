import {mergeImport,Config} from './core';
function stable(value:any):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value)}
export async function importData(cfg:Config,text:string){
 const data=JSON.parse(text);if(data?.format!=='vgen-nya.legacy-export')return mergeImport(cfg,data);
 if(data.schemaVersion!==1||!data.payload||!['vgen-toolkit','vgen-tag-quick'].includes(data.source?.id))throw Error('旧导出文件版本或来源不支持');
 const unsigned={format:data.format,schemaVersion:data.schemaVersion,source:data.source,bridgeVersion:data.bridgeVersion,exportedAt:data.exportedAt,payload:data.payload};const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(unsigned)));const digest=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');if(data.integrity?.algorithm!=='SHA-256'||data.integrity.digest!==digest)throw Error('旧导出文件校验失败，尚未修改当前数据');
 const payload=Object.fromEntries(Object.entries(data.payload).map(([key,value])=>[key,typeof value==='string'?JSON.parse(value):value]));return mergeImport(cfg,payload);
}
