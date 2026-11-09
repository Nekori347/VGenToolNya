import {defaults,providers,mergeImport,Versions,endpoint,permissionOrigin,Config} from './core';
import {css} from './style';
import {extraCSS,tagPanelCSS} from './extra-style';
import {legacyCSS} from './legacy-ui';
import {importData} from './migration';
import {clientManager} from './clients';
import {presetManager} from './preset-ui';
import {plainText} from './native-fields';
export async function rpc(type:string,extra:any={}){const r=await chrome.runtime.sendMessage({type,...extra});if(!r?.ok)throw Error(r?.error||'扩展后台未响应');return r.value}
export function el(tag:string,text='',parent?:Node):any{const e=document.createElement(tag);e.textContent=text;parent?.appendChild(e);return e}
export function button(parent:Node,text:string,action:()=>any){const b=el('button',text,parent);b.type='button';b.onclick=async()=>{b.disabled=true;try{await action()}catch(e){const p=el('p',String(e.message||e),parent);p.className='error'}finally{b.disabled=false}};return b}
export function field(parent:Node,title:string,value='',type='input'){const l=el('label',title,parent);const i=el(type,'',l);i.value=value;return i}
export function mount(parent:Node){const host=el('div','',parent);host.dataset.nya='';const root=host.attachShadow({mode:'open'});el('style',css+extraCSS+legacyCSS+tagPanelCSS,root);if(matchMedia('(prefers-color-scheme:dark)').matches)host.dataset.dark='';return {host,root}}
function nativeDark(host:HTMLElement){for(let e=host.parentElement;e;e=e.parentElement){const color=getComputedStyle(e).backgroundColor;const rgb=color.match(/rgba?\((\d+), (\d+), (\d+)/);if(rgb&&color!=='rgba(0, 0, 0, 0)')return Number(rgb[1])*.299+Number(rgb[2])*.587+Number(rgb[3])*.114<128}return matchMedia('(prefers-color-scheme:dark)').matches}
export function theme(host:HTMLElement,cfg:Config){host.toggleAttribute('data-dark',cfg.theme==='dark'||cfg.theme==='auto'&&nativeDark(host))}
export async function settings(root:ShadowRoot,cfg:Config,onSave:(c:Config)=>void,bridge:(op:string,data?:any)=>Promise<any>=(op,data)=>rpc('native',{op,...data})){
 const panel=el('section','',root);panel.className='panel';el('h2','VGenToolNya',panel);el('p','画师工作台 · 预设 / 翻译 / 客户',panel);
 if(location.protocol!=='chrome-extension:')button(panel,'在扩展页面打开完整设置',()=>rpc('options'));
 const status=el('p','',panel);const save=async()=>{await rpc('save',{config:cfg});theme(root.host as HTMLElement,cfg);onSave(cfg);status.textContent='已保存'};
 const prefs=el('div','',panel);prefs.className='card';
 for(const [key,title,choices] of ([['language','界面汉化',['zh','en','bilingual']],['theme','主题',['auto','light','dark']]] as [string,string,string[]][])){const s=field(prefs,title,cfg[key],'select');for(const v of choices)el('option',({zh:'中文',en:'英文原文',bilingual:'双语（上下对照）',auto:'跟随系统',light:'浅色',dark:'深色'})[v]||v,s).value=v;s.value=cfg[key];s.onchange=()=>{cfg[key]=s.value;save()}}
 for(const key of ['fields','chat','orders','clients']){const l=el('label',`启用 ${({fields:'输入框工具',chat:'聊天增强',orders:'订单客户工具',clients:'常用客户侧栏'})[key]||key}`,prefs);l.className='check';const i=el('input','',l);i.type='checkbox';i.checked=cfg.modules[key];i.onchange=()=>{cfg.modules[key]=i.checked;save()}}
 for(const [key,title] of [['keepUnread','聊天保持未读（仅拦截，不主动发送请求）'],['compact','紧凑 Emoji 表态布局'],['reactionMarkRead','表态成功后标记已读'],['showSeen','显示对方已读状态'],['showTimestamps','常驻显示消息时间'],['showStatusBar','显示聊天已读控制条'],['autoCollapseDiscovery','自动收起发现标签原生选项']]){const l=el('label',title,prefs);l.className='check';const i=el('input','',l);i.type='checkbox';i.checked=cfg[key];i.onchange=()=>{cfg[key]=i.checked;save()}}
 const api=el('details','',panel);api.className='card';api.dataset.section='api';el('summary','AI 服务商与模型',api);const provider=field(api,'服务商',cfg.provider,'select');for(const p of Object.keys(providers))el('option',p,provider).value=p;provider.value=cfg.provider;
 const inputs:any={};for(const [key,title] of [['baseURL','Base URL'],['model','默认翻译模型'],['backModel','回译模型（留空使用默认）'],['reviewModel','评价模型（留空使用默认）']])inputs[key]=field(api,title,cfg[key]);
 provider.onchange=()=>{cfg.apiProfiles[cfg.provider]=Object.fromEntries(Object.entries(inputs).map(([key,input]:any)=>[key,input.value]));cfg.provider=provider.value;const profile=cfg.apiProfiles[cfg.provider]||{baseURL:providers[cfg.provider],model:'',backModel:'',reviewModel:''};for(const k in inputs)inputs[k].value=profile[k]||''};const key=field(api,'API Key（留空保留现有；不会导出）');key.type='password';key.autocomplete='off';
 const mockLabel=el('label','模拟响应（固定样例，不发送任何内容）',api);mockLabel.className='check';const mock=el('input','',mockLabel);mock.type='checkbox';mock.checked=cfg.mock;
 button(api,'保存 API 配置',async()=>{for(const k in inputs)cfg[k]=inputs[k].value.trim();cfg.apiProfiles[cfg.provider]=Object.fromEntries(Object.keys(inputs).map(k=>[k,cfg[k]]));cfg.mock=mock.checked;if(!cfg.mock)endpoint(cfg.baseURL);if(key.value){await rpc('key',{key:key.value,provider:cfg.provider});key.value=''}await save()});
 button(api,'授权当前接口域名',async()=>{const origin=permissionOrigin(inputs.baseURL.value);const ok=await chrome.permissions.request({origins:[origin]});status.textContent=ok?'接口域名已授权':'未授权'});
 button(api,'清除当前服务商 Key',()=>rpc('key',{key:'',provider:cfg.provider}));
 button(api,'连接测试（已保存配置，仅合成文本）',async()=>{status.textContent=await rpc('ai',{payload:{task:'test',text:'Reply OK'}})});
 const presets=el('details','',panel);presets.className='card';presets.dataset.section='presets';el('summary','统一预设管理',presets);
 const render=presetManager(presets,cfg,save);
 const clients=el('details','',panel);clients.className='card';clients.dataset.section='clients';el('summary','常用访问',clients);const renderClients=clientManager(clients,cfg,save,c=>bridge('profile',{value:{username:c.username||c.handle}}));
 const data=el('details','',panel);data.className='card';el('summary','数据导入 / 导出',data);el('p','导出不包含 API Key。导入按预设 ID 合并；旧 GM 数据保存在 legacy 中，不改动油猴存储。',data);
 const locale=el('details','',panel);locale.className='card';locale.dataset.section='locale';el('summary','本地汉化 · 原生文案与漏翻管理',locale);
 el('p','仅采集具有公开静态文案证据的原生组件；私人内容、输入值和来源不明的文字不采集。词典及报告均留在本机。',locale);
 const stats=el('pre','展开后刷新查看各页面命中与漏翻统计。',locale);
 let localeReports:any={};
 const refreshLocale=async()=>{localeReports=await rpc('locale-reports');stats.textContent=Object.entries(localeReports).map(([page,r]:any)=>`${page}：命中 ${r.terms.filter(t=>t.translation!==null).length} · 漏翻 ${r.terms.filter(t=>t.translation===null).length}`).join('\n')||'尚无原生文案记录，请先访问 VGen 画师页面。'};
 button(locale,'刷新本地词条统计',refreshLocale);locale.ontoggle=()=>{if(locale.open)void refreshLocale()};
 const download=(name:string,value:any)=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 button(locale,'导出未命中词条',async()=>{await refreshLocale();download('VGenToolNya-missed-ui.json',Object.fromEntries(Object.entries(localeReports).map(([page,r]:any)=>[page,r.terms.filter(t=>t.translation===null)])))});
 button(locale,'导出原生 UI 清单',async()=>{await refreshLocale();download('VGenToolNya-native-ui.json',localeReports)});
 el('p','补充词典格式：{"portfolio|*|Native caption":"中文"}。组件名可替换 *，只在该页面和上下文生效。',locale);
 const additions=field(locale,'上下文词典 JSON',JSON.stringify(cfg.localeOverrides||{},null,2),'textarea');
 button(locale,'保存并重新核验本地词典',async()=>{const value=JSON.parse(additions.value);if(!value||Array.isArray(value)||Object.entries(value).some(([k,v])=>!/^\w+\|[\w*]+\|.{1,350}$/.test(k)||typeof v!=='string'))throw Error('词典格式错误');cfg.localeOverrides=value;await save();setTimeout(()=>void refreshLocale(),1200)});
 button(data,'导出数据',()=>{const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({presets:cfg.presets,clients:cfg.clients,legacy:cfg.legacy,config:cfg},null,2)],{type:'application/json'}));a.download='VGenToolNya-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
 const file=field(data,'选择 JSON 文件');file.type='file';file.accept='.json';file.onchange=async()=>{try{const next=await importData(cfg,await file.files[0].text());Object.assign(cfg,next);await save();render();renderClients()}catch(e){status.textContent=e.message}};
 const diag=el('details','',panel);diag.className='card';el('summary','高级诊断',diag);el('p','仅记录事件类型、状态码和统计，不记录正文、URL、身份标识或凭据。',diag);const diagnostic=el('pre','',diag);
 for(const [label,op]of [['开始记录','diagnostic-start'],['结束记录','diagnostic-stop'],['刷新状态','diagnostic']])button(diag,label,async()=>{diagnostic.textContent=JSON.stringify(await bridge(op),null,2)});
 button(diag,'导出诊断报告',async()=>{const value=await bridge('diagnostic');const a=el('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));a.download='VGenToolNya-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
 const review=el('details','',panel);review.className='card';el('summary','评价默认意图与语气',review);const tone=field(review,'默认评价语气',cfg.reviewTone);const intent=field(review,'默认评价意图',cfg.reviewIntent,'textarea');button(review,'保存评价偏好',async()=>{cfg.reviewTone=tone.value;cfg.reviewIntent=intent.value;await save()});

 return panel;
}
export {editor} from './editor';
