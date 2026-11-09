import {setIcon} from '../src/icons';
import {defineContentScript} from 'wxt/utils/define-content-script';
import {rpc,mount,button,el,field,settings,editor,theme} from '../src/ui';
import {localize,bilingualCSS,handleLocaleMutations,configureLocale,localeReport,clearLocaleReport} from '../src/localize';
import {configWithDefaults} from '../src/core';
import {ClientsPanel} from '../src/clients';
import {uploadTools,presetValueKey} from '../src/preset-ui';

export default defineContentScript({matches:['https://vgen.co/*'],runAt:'document_idle',async main(){
 if(document.querySelector('[data-nya-main]'))return;
 const cfg=configWithDefaults(await rpc('load'));const {host,root}=mount(document.body);host.dataset.nyaMain='';host.style.display='contents';theme(host,cfg);
 const pending=new Map();
 document.addEventListener('nya-result',(event:CustomEvent)=>{const p=pending.get(event.detail?.id);if(p){pending.delete(event.detail.id);event.detail.ok?p.resolve(event.detail.result):p.reject(Error(event.detail.error))}});
 const bridge=(op:string,extra:any={})=>new Promise<any>((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('原生操作超时，请检查页面或重试'))},op==='client'||op==='profile'?60000:10000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});document.dispatchEvent(new CustomEvent('nya-command',{detail:{id,op,...extra}}))});
 const attached=new Map<string,HTMLElement>();const observedValues=new Map<string,string>();let overlay:HTMLElement;let scanning=false,queued=false;
 const save=async()=>{await rpc('save',{config:cfg})};
 const openSettings=async(section?:string,kind?:string)=>{if(overlay){overlay.remove();overlay=null;if(!section)return}overlay=el('div','',root);overlay.className='overlay';button(overlay,'关闭',()=>{overlay.remove();overlay=null}).className='close';const inner=mount(overlay);theme(inner.host,cfg);await settings(inner.root,cfg,()=>apply(),bridge);if(section){const details=inner.root.querySelector(`[data-section="${section}"]`);if(details){details.open=true;details.scrollIntoView({block:'start'});if(kind){const select=details.querySelector('[data-preset-kind]');if(select){select.value=kind;select.dispatchEvent(new Event('change'))}}}}};
 const controls=mount(document.createDocumentFragment());controls.host.dataset.nyaControls='';const bar=el('div','',controls.root);bar.className='nya-integrated-controls';
 const gear=button(bar,'',()=>openSettings());setIcon(gear,'settings','VGenToolNya 设置');
 const language=el('select','',bar);language.setAttribute('aria-label','界面语言');for(const [value,label]of [['zh','中文'],['en','English'],['bilingual','双语']])el('option',label,language).value=value;language.value=cfg.language;language.onchange=async()=>{cfg.language=language.value;await save();apply()};
 function placeControls(){const footer=document.querySelector('[class*="Sidebar"] footer,.sidebarFooter,[class*="SidebarFooter"],.sidebarLinks');if(footer&&controls.host.parentElement!==footer.parentElement)footer.before(controls.host);else if(!controls.host.isConnected){document.querySelector('header')?.append(controls.host)}}
 const chatStyle=el('style','',document.head);chatStyle.dataset.nya='';
 const clients=new ClientsPanel(cfg,save,bridge,()=>openSettings('clients'));
 let lastFieldConfig='';
 const apply=()=>{
  theme(host,cfg);for(const h of orderPanels.values())theme(h,cfg);if(chatTools)theme(chatTools,cfg);theme(monitor.host,cfg);const settingsHost=overlay?.querySelector<HTMLElement>('[data-nya]');if(settingsHost)theme(settingsHost,cfg);language.value=cfg.language;configureLocale(cfg.localeOverrides);localize(cfg.language);bridge('config',{value:{modules:cfg.modules,keepUnread:cfg.keepUnread,reactionMarkRead:cfg.reactionMarkRead,compact:cfg.compact,showSeen:cfg.showSeen,showTimestamps:cfg.showTimestamps,showStatusBar:cfg.showStatusBar,autoCollapseDiscovery:cfg.autoCollapseDiscovery}}).catch(()=>{});
  const fieldConfig=JSON.stringify([cfg.modules,cfg.presetModules,cfg.presets,cfg.theme,cfg.mock]);if(fieldConfig!==lastFieldConfig){for(const h of attached.values())h.remove();attached.clear();lastFieldConfig=fieldConfig}clients.cfg=cfg;clients.signature='';clients.sync();schedule();
  chatStyle.textContent=bilingualCSS+(cfg.modules.chat?`.vgen-nya-status-row{display:flex;align-items:center;gap:5px;padding-top:4px}.vgen-nya-state-bar{height:1px;background:#5a969d55;flex:1}.vgen-nya-chat-meta{display:flex;gap:8px;font-size:11px;opacity:.75}.vgen-nya-read-marker{color:#1a9e9b;background:transparent;border:0;cursor:pointer}.vgen-nya-read-marker[data-status="unread"]{color:#de7373}.vgen-nya-read-marker:disabled{cursor:default}`:'')+(cfg.modules.chat&&cfg.compact?`.str-chat__message-metadata{opacity:1!important;visibility:visible!important;display:flex!important}.str-chat__message-bubble-group{display:flex!important;flex-direction:column!important;overflow:visible!important}.str-chat__message-bubble-group>.str-chat__message-bubble{order:10}.str-chat__message-bubble-group>.vgen-nya-status-row{order:15}.str-chat__message-bubble-group>.str-chat__message-reactions-host{order:20;position:static!important;transform:none!important;display:flex!important;min-width:0;flex-wrap:wrap;gap:3px;padding-top:3px}.str-chat__message-bubble-group>.vgen-nya-chat-meta{order:30}[data-vgen-nya-compact-reactions="true"]{display:flex!important;flex-wrap:wrap;gap:3px}[data-vgen-nya-compact-reactions="true"] button{min-height:22px!important;padding:1px 5px!important}.str-chat__message-reactions-host [class*="EmojiButtonWrapper"]{display:inline-flex!important;margin:1px!important}`:'');
 };
 chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
  if(msg.type==='config-updated'){Object.assign(cfg,configWithDefaults(msg.config));apply();return}
  if(msg.type==='locale-current'){if(msg.clear)clearLocaleReport();reply(localeReport());return}
  if(msg.type==='native-request'){bridge(msg.op).then(value=>reply({ok:true,value}),e=>reply({ok:false,error:e.message}));return true}
 });
 const orderPanels=new Map<Element,HTMLElement>();const clientCache=new Map<string,Promise<any>>();
 async function orderTools(){
  for(const [card,h]of orderPanels)if(!card.isConnected||!cfg.modules.orders){h.remove();orderPanels.delete(card)}
  if(!cfg.modules.orders)return;
  for(const card of document.querySelectorAll('.commissionSideColumn .userDetails,[class*="ChatModalInfoPanel"] .userDetails')){
   const link=[...card.querySelectorAll<HTMLAnchorElement>('a[href]')].find(a=>a.textContent.trim().startsWith('@'));if(!link)continue;
   const url=new URL(link.href);if(url.origin!=='https://vgen.co'||url.pathname.split('/').filter(Boolean).length!==1)continue;const username=decodeURIComponent(url.pathname.slice(1));if(orderPanels.has(card)){const old=orderPanels.get(card);if(old.dataset.nyaClient===username)continue;old.remove();orderPanels.delete(card)}
   const m=mount(card);m.host.dataset.nyaClient=username;orderPanels.set(card,m.host);theme(m.host,cfg);const controls=el('div','',m.root);controls.className='bar';button(controls,'复制主页',()=>navigator.clipboard.writeText('https://vgen.co/'+encodeURIComponent(username)));
   const status=el('p','读取客户评价指标…',m.root);status.className='muted';let detail:any;const reviewDetails=el('div','',m.root);
   const copy=button(controls,'复制真实 User ID',()=>{if(!detail?.clientUserId)throw Error('真实 ID 尚不可用');return navigator.clipboard.writeText(detail.clientUserId)});copy.disabled=true;
   const load=async(force=false)=>{if(force)clientCache.delete(username);if(!clientCache.has(username))clientCache.set(username,bridge('client',{value:{username}}));try{detail=await clientCache.get(username);reviewDetails.replaceChildren();copy.disabled=!detail.clientUserId;const stats=detail.clientReviewStats;const negative=stats?.totalNegativeReviews;
    if(typeof negative==='number'&&negative>0){status.textContent=`注意：${typeof stats.percentagePositive==='number'?stats.percentagePositive+'% 好评；':''}${negative} 条负面评价`;status.style.color='#c15b4e';status.className='';const text=detail.negativeReviews?.map(r=>r.body||'无文字差评').join('\n');status.title=text||'公开差评明细不可用';if(detail.detailsError)status.title+='\n'+detail.detailsError;
     const details=el('details','',reviewDetails);el('summary','查看可取得的差评明细',details);for(const r of detail.negativeReviews||[])el('p',r.body||'无文字差评',details);if(!detail.negativeReviews?.length)el('p','指标显示存在差评，但明细不可用。',details);if(detail.negativeReviews?.length<negative)el('p','仅显示可取得的明细，可能包含无文字、未公开或分页范围外的差评。',details);
    }else status.textContent=negative===0?'公开指标未显示负面评价':'好评率指标不可用';
   }catch(e){status.textContent=e.message;clientCache.delete(username)}};
   button(controls,'刷新指标',()=>load(true));void load();
  }
 }
 let chatTools:HTMLElement;const monitor=mount(document.createDocumentFragment());let monitorTick=0;
 async function scan(){
  if(scanning){queued=true;return}scanning=true;try{
   for(const orphan of document.querySelectorAll('[data-nya-toolbar]'))if(!orphan.shadowRoot)orphan.remove();
   localize(cfg.language);clients.sync();placeControls();theme(controls.host,cfg);void orderTools();
   const fields=await bridge('scan');
   for(const [id,h]of attached)if(!h.isConnected||!document.querySelector(`[data-nya-field="${id}"]`)){h.remove();attached.delete(id)}
   for(const f of fields){if(attached.has(f.id)){if(observedValues.get(f.id)!==f.value){observedValues.set(f.id,f.value);const shadow=attached.get(f.id).shadowRoot;const matching=cfg.presets.find(p=>p.kind===f.kind&&presetValueKey(p.kind,p.text)===presetValueKey(f.kind,f.value));const select=shadow?.querySelector('select');if(select&&!shadow.activeElement)select.value=matching?.id||'';shadow?.querySelector('.vtq-tags-panel')?.dispatchEvent(new Event('nya-sync'));}continue}observedValues.set(f.id,f.value);if(!cfg.modules.fields||!cfg.presetModules[f.kind]||(f.kind==='chat'&&!cfg.modules.chat))continue;const element=document.querySelector<HTMLElement>(`[data-nya-field="${f.id}"]`);if(!element)continue;
    const fieldContainer=element.closest('[class*="InputField__Container"],.formLabel,[class*="MessageInput__Container"],.descriptionEditor') as HTMLElement;
    const titleElement=f.kind==='global'?element.querySelector<HTMLElement>('[data-nya-kind="title"]'):null;
    const anchor=f.kind==='global'?(titleElement?.closest<HTMLElement>('[class*="InputField__Container"]')||titleElement?.closest<HTMLElement>('.formLabel')||titleElement):fieldContainer||element;
    if(!anchor?.parentElement)continue;const m=mount(anchor.parentElement);if(f.kind==='global')anchor.before(m.host);else anchor.after(m.host);m.host.dataset.nyaToolbar=f.kind;attached.set(f.id,m.host);theme(m.host,cfg);
    if(['tags','discovery','global','serviceTags'].includes(f.kind))uploadTools(m.root,cfg,f,bridge,save,()=>openSettings('presets',f.kind));
    else editor(m.root,cfg,f.kind,()=>bridge('read',{field:f.id}),async value=>{await bridge('write',{field:f.id,value})},{nativeTags:f.tags,manage:()=>openSettings('presets',f.kind)});
   }
   const chat=document.querySelector('.str-chat__main-panel');if(chat&&cfg.modules.chat){if(!chatTools?.isConnected){const m=mount(chat);chatTools=m.host;chat.prepend(chatTools);button(m.root,'跳到最新',()=>bridge('jump-latest'));button(m.root,'聊天设置',openSettings);m.root.append(monitor.host)}
    if(Date.now()-monitorTick>1000){monitorTick=Date.now();const d=await bridge('diagnostic');monitor.root.querySelector('p')?.remove();el('p',`${cfg.keepUnread?'保持未读':'原生已读'} · 拦截通道 ${d.chat.pendingChannels} · 诊断 ${d.recording?'记录中':'未启动'}`,monitor.root).className='monitor'}
   }else if(chatTools){chatTools.remove();chatTools=null}
  }catch(e){host.dataset.nyaBridgeError=e.message}finally{scanning=false;if(queued){queued=false;schedule()}}
 }
 let timer:any;function schedule(){if(!timer)timer=setTimeout(()=>{timer=null;void scan()},120)}
 const observer=new MutationObserver(records=>{
  handleLocaleMutations(records);
  const owned=(r:MutationRecord)=>{const e=r.target.nodeType===1?r.target as Element:r.target.parentElement;if(e?.closest('[data-nya],[data-vgen-nya-ui]'))return true;const nodes=[...r.addedNodes,...r.removedNodes];return r.type==='childList'&&nodes.length>0&&nodes.every(n=>n.nodeType===1&&((n as Element).hasAttribute('data-nya')||(n as Element).hasAttribute('data-vgen-nya-ui')))};
  if(!records.every(owned))schedule();
 });observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','hidden','aria-hidden','placeholder','title','aria-label','disabled','readonly','contenteditable','aria-disabled','data-slate-readonly']});
 document.addEventListener('input',event=>{if(!(event.target as Element).closest?.('[data-nya]'))schedule()},true);
 observer.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
 window.addEventListener('popstate',schedule);window.addEventListener('hashchange',schedule);window.addEventListener('nya-route',schedule);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay){overlay.remove();overlay=null}});
 const selectionButton=button(bar,'按需汉化选中文字',()=>{
  const selected=window.getSelection()?.toString().trim();if(!selected)throw Error('请先选择要翻译的客户文本');const pane=el('div','',root);pane.className='overlay';const inner=el('section','',pane);inner.className='panel';button(inner,'关闭',()=>pane.remove());el('h2','客户内容按需汉化',inner);const source=field(inner,'仅发送下方文字',selected,'textarea');const output=field(inner,'中文结果','','textarea');button(inner,'确认发送并翻译',async()=>{output.value=await rpc('ai',{payload:{task:'toChinese',text:source.value}})});
 });setIcon(selectionButton,'translate','翻译选中文字');selectionButton.hidden=true;
 document.addEventListener('selectionchange',()=>{selectionButton.hidden=!window.getSelection()?.toString().trim()});
 apply();
 const interval=setInterval(()=>{if(document.querySelector('.str-chat__channel')&&cfg.modules.chat)schedule()},1500);

}});
