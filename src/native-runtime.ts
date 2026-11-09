import {VGenUploadAdapter,tagBridgeFromInput} from './upload-adapter';
import {ReadGate} from './read-gate';
import {ChatNetworkHooks} from './network-hooks';
import {StreamChatAdapter} from './stream-chat-adapter';
import {normalizeReviewEntries,resolvePublicClientIdentity} from './client-review-adapter';
import {configWithDefaults} from './core';
import {textTarget,reviewTarget,nativeStore,walkReact,isWritableField,fieldLabel} from './native-fields';
import {profileSlug,refreshProfile} from './clients';

export function installNative(){
 if((window as any).__nyaNative)return;(window as any).__nyaNative=true;
 let cfg=configWithDefaults();const gate=new ReadGate({enabled:true});
 const events:any[]=[];let recording=false,startedAt='';
 try{const prior=JSON.parse(sessionStorage.getItem('nya-diagnostic-session')||'null');if(prior){recording=prior.recording===true;startedAt=prior.startedAt||'';if(Array.isArray(prior.events))events.push(...prior.events.slice(-500))}}catch{}
 const persist=()=>{try{sessionStorage.setItem('nya-diagnostic-session',JSON.stringify({recording,startedAt,events}))}catch{}};
 const record=(event:any)=>{if(!recording)return;events.push({type:event.type,at:event.at||new Date().toISOString(),kind:event.kind,status:event.status,reason:event.reason});if(events.length>500)events.shift();persist()};
 const hooks=new (ChatNetworkHooks as any)({windowObject:window,readGate:gate,onDiagnosticEvent:record});hooks.configureRead(true);hooks.configureDiagnostics(recording);
 for(const event of ['pointerdown','input','change','scroll'])document.addEventListener(event,()=>record({type:'ui.'+event}),{capture:true,passive:true});
 for(const method of ['pushState','replaceState'] as const){const original=history[method];history[method]=function(...args:any[]){const result=original.apply(this,args as any);window.dispatchEvent(new Event('nya-route'));record({type:'route.change'});return result}}
 const fields=new Map<string,any>();let sequence=0;
 const bind=(element:HTMLElement,kind:string,target:any,extra:any={})=>{
  if(!element||!target||!isWritableField(element))return;let id=element.dataset.nyaField;
  if(id&&fields.has(id)){Object.assign(fields.get(id),{...extra,target});return}
  id=String(++sequence);element.dataset.nyaField=id;element.dataset.nyaKind=kind;fields.set(id,{element,kind,target,...extra});
 };
 const adapters=new Map<Element,StreamChatAdapter>();
 const diagnostics=()=>({version:'0.1.0',recording,startedAt,eventCount:events.length,events:[...events],fields:[...fields.values()].map(f=>({kind:f.kind,connected:f.element.isConnected})),chat:{enabled:cfg.modules.chat,keepUnread:gate.enabled,pendingChannels:gate.pending.size,latestChannels:gate.latest.size},route:/creator/.test(location.pathname)?'creator':/commission|my-orders|my-requests/.test(location.pathname)?'orders':'public'});
 const scan=()=>{
  for(const [id,f]of fields)if(!f.element.isConnected||!isWritableField(f.element)){delete f.element.dataset.nyaField;delete f.element.dataset.nyaKind;fields.delete(id)}
  for(const surface of document.querySelectorAll(VGenUploadAdapter.modalSelector)){
   const a=new VGenUploadAdapter(surface);if(!a.bridge())continue;
   bind(a.findTitleInput(),'title',{read:()=>a.read().title,write:v=>a.applyText('title',v)});
   bind(a.findDescriptionEditor(),'description',{read:()=>a.read().description,write:v=>a.applyText('description',v.startsWith('[')?v:JSON.stringify([{type:'paragraph',children:[{text:v}]}]))});
   bind(a.findTagInput(),'tags',{read:()=>JSON.stringify(a.read().tags),write:v=>a.setTags(JSON.parse(v))});
   bind(surface as HTMLElement,'global',{read:()=>JSON.stringify(a.read({includeDiscovery:true,includeDiscoverySchema:true})),write:v=>a.applyCombination(JSON.parse(v))});
   bind(a.findDiscoverySection(),'discovery',{read:()=>JSON.stringify(a.read({includeDiscovery:true}).discoveryValues),write:v=>a.applyDiscovery({values:JSON.parse(v)})},{schema:()=>a.read({includeDiscoverySchema:true}).discoverySchema});
   if(cfg.autoCollapseDiscovery)a.collapseDiscovery();
  }
  for(const element of document.querySelectorAll<HTMLElement>('textarea,input[type="text"],input:not([type]),[contenteditable="true"],[data-slate-editor="true"]')){
   if(element.dataset.nyaField||element.closest('[data-nya]')||!isWritableField(element))continue;
   const review=reviewTarget(element);
   if(review&&element.matches('textarea,[contenteditable="true"]')){bind(element,'review',review,{tags:review.tags});continue}
   const tagBridge=tagBridgeFromInput(element);
   if(tagBridge&&/creator/.test(location.pathname)&&element.matches('input')){bind(element,'serviceTags',{read:()=>JSON.stringify(tagBridgeFromInput(element)?.tags||[]),write:async v=>{const tags=JSON.parse(v);const bridge=tagBridgeFromInput(element);if(!bridge)throw Error('标签组件已卸载');if(tags.length>bridge.tagLimit)throw Error('超过原生标签数量限制');await bridge.onChange(tags)}});continue}
   const native=textTarget(element);if(!native)continue;
   const isChat=!!element.closest('.str-chat,[class*="MessageInput"]');
   const modal=element.closest('[class*="CommissionModal"],.commissionSideColumn,[class*="ReviewModal"],[class*="ServiceModal"]');
   const isOrder=!!modal||/my-orders|my-requests|commission\//.test(location.pathname);
   const label=fieldLabel(element);
   const kind=isChat?'chat':/review|feedback/i.test(label)?'review':isOrder?'order':/creator/.test(location.pathname)&&/title|description|details|message|note|terms/i.test(label)?/title/i.test(label)?'title':'description':'';
   if(kind){const fieldName=/private.?note|note to self/i.test(label)?'privateNote':/final|delivery/i.test(label)?'delivery':undefined;bind(element,fieldName||kind,native,{fieldName})}
  }
  for(const [surface,a]of adapters)if(!surface.isConnected||!cfg.modules.chat){a.cleanup();adapters.delete(surface)}
  if(cfg.modules.chat)for(const surface of document.querySelectorAll('.str-chat__channel')){
   let a=adapters.get(surface);if(!a){a=new StreamChatAdapter(surface);adapters.set(surface,a)}
   a.refresh({settings:{keepUnread:cfg.keepUnread,showSeen:cfg.showSeen,showTimestamps:cfg.showTimestamps,showStatusBar:cfg.showStatusBar,compactReactions:cfg.compact},readGate:gate,onManualRead:(cid,ch)=>gate.manualRelease(cid,()=>ch.markRead())} as any);
   const jump=surface.querySelector('[data-vgen-nya-native-latest="true"]');
   if(jump&&!jump.hasAttribute('data-nya-latest-handled')){jump.setAttribute('data-nya-latest-handled','true');a.jumpToPresent()}
  }
  return [...fields].map(([id,f])=>({id,kind:f.kind,fieldName:f.fieldName,value:f.target.read(),schema:f.schema?.()||[],tags:f.tags?.()||[]}));
 };
 const getClient=async(value:any)=>{
  const card=document.querySelector('.commissionSideColumn,[class*="ChatModalInfoPanel"]');const identity=value?.username?{handle:profileSlug(value.username),profileUrl:'https://vgen.co/'+profileSlug(value.username),clientId:'@'+profileSlug(value.username)}:resolvePublicClientIdentity(card);
  if(!identity)throw Error('客户名片不可用');
  const user=await fetch('https://api.vgen.co/user/'+encodeURIComponent(identity.handle),{credentials:'omit',headers:{'v-client-id':'vgen-web'},signal:AbortSignal.timeout(15000)}).then(r=>{if(!r.ok)throw Error('客户评价指标读取失败');return r.json()});
  if(typeof user.userID!=='string'||!user.userID)throw Error('客户真实 ID 数据不可用');const profile={username:user.username||identity.handle,userID:user.userID,url:'https://vgen.co/'+encodeURIComponent(user.username||identity.handle)};
  const entries:any[]=[];let detailsError='';
  if(user.clientReviewStats?.totalReviews>0)try{for(let offset=0;offset<100;offset+=20){const r=await fetch(`https://api.vgen.co/discoverability/reviews/client/${encodeURIComponent(profile.userID)}?offset=${offset}&limit=20`,{credentials:'omit',headers:{'v-client-id':'vgen-web'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('评价明细不可访问');const list=await r.json();if(!Array.isArray(list))throw Error('评价明细格式未知');entries.push(...list);if(list.length<20)break}}catch(e){detailsError=e.message}
  return {...normalizeReviewEntries(entries,{...identity,clientUserId:profile.userID},Date.now(),user.clientReviewStats),clientUserId:profile.userID,profileUrl:profile.url,detailsError};
 };
 document.addEventListener('nya-command',async(event:CustomEvent)=>{
  const {id,op,field,value}=event.detail||{};try{let result:any;
   switch(op){
    case 'scan':result=scan();break;
    case 'config':cfg=configWithDefaults(value);gate.configure({enabled:cfg.modules.chat&&cfg.keepUnread,reactionMarkRead:cfg.reactionMarkRead});hooks.configureRead(cfg.modules.chat&&cfg.keepUnread);break;
    case 'read':{const f=fields.get(field);if(!f?.element.isConnected)throw Error('组件已卸载');result=f.target.read();break}
    case 'write':{const f=fields.get(field);if(!f?.element.isConnected)throw Error('组件已卸载');if(!isWritableField(f.element))throw Error('当前字段不可编辑');await f.target.write(value);await new Promise(r=>setTimeout(r,100));result=f.target.read();if(['title','chat','order','review'].includes(f.kind)&&result!==value&&!f.element.isContentEditable)throw Error('原生状态确认失败');break}
    case 'profile':result=await refreshProfile({username:profileSlug(value.username)},fetch,true);break;
    case 'client':result=await getClient(value);break;
    case 'open-chat':{let target=value;if(!target.userID)target=await refreshProfile({username:profileSlug(target.username)},fetch,true);await StreamChatAdapter.openUser(target);result=true;break}
    case 'jump-latest':{for(const a of adapters.values())a.jumpToPresent();result=true;break}
    case 'diagnostic-start':recording=true;startedAt=new Date().toISOString();events.length=0;hooks.configureDiagnostics(true);record({type:'session.start'});result=diagnostics();break;
    case 'diagnostic-stop':record({type:'session.stop'});recording=false;persist();hooks.configureDiagnostics(false);result=diagnostics();break;
    case 'diagnostic':result=diagnostics();break;
    default:throw Error('未知原生操作');
   }
   document.dispatchEvent(new CustomEvent('nya-result',{detail:{id,ok:true,result}}));
  }catch(e){document.dispatchEvent(new CustomEvent('nya-result',{detail:{id,ok:false,error:e.message}}))}
 });
}
