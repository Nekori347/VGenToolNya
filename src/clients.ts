import type {Config} from './core';
import {el,button,field,mount,theme} from './ui';
import {setIcon} from './icons';

export const PROFILE_CACHE_MS=6*60*60*1000;
export function profileSlug(value:string){
 const raw=String(value||'').trim();let slug=raw.replace(/^@/,'');
 if(/^https?:/.test(raw)){const url=new URL(raw);if(url.origin!=='https://vgen.co')throw Error('请输入 VGen 主页');slug=url.pathname.split('/').filter(Boolean)[0]||''}
 if(!/^[A-Za-z0-9_-]+$/.test(slug)||['creator','messages','settings','my-orders','my-requests','search','shop','commission','portfolio','login','signup'].includes(slug.toLowerCase()))throw Error('用户名或主页无效');return slug;
}
export function remoteImage(value:string){try{const u=new URL(value);return u.protocol==='https:'?u.href:''}catch{return ''}}
export async function refreshProfile(client:any,fetcher=fetch,force=false,now=Date.now()){
 if(!force&&client.profileFetchedAt&&now-client.profileFetchedAt<PROFILE_CACHE_MS)return client;
 const slug=profileSlug(client.username||client.handle||client.url);const api=async(path:string)=>{const r=await fetcher('https://api.vgen.co'+path,{method:'GET',headers:{'v-client-id':'vgen-web'},credentials:'omit',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`客户资料读取失败（HTTP ${r.status}）`);return r.json()};
 const profile=await api('/user/'+encodeURIComponent(slug));if(typeof profile?.userID!=='string'||!profile.userID)throw Error('资料未提供内部 User ID');
 const [services,portfolio]=await Promise.allSettled([api('/commission/services/'+encodeURIComponent(profile.userID)),api('/discoverability/portfolio/showcases/'+encodeURIComponent(profile.userID)+'?limit=1&verifyAge=true')]);
 const dates=(items:any[])=>items?.reduce((last,item)=>{const d=item?.modified||item?.created;return d&&(!last||Date.parse(d)>Date.parse(last))?d:last},'')||'';
 return {...client,id:client.id||crypto.randomUUID(),username:profile.username||slug,userID:profile.userID,url:'https://vgen.co/'+encodeURIComponent(profile.username||slug),displayName:profile.displayName||'',avatarURL:remoteImage(profile.avatarURL),bannerURL:remoteImage(profile.bannerURL),announcementMessage:String(profile.announcement?.message||'').slice(0,500),announcementModified:profile.announcement?.modified||'',lastServiceUpdate:services.status==='fulfilled'?dates(services.value):client.lastServiceUpdate,lastPortfolioUpdate:portfolio.status==='fulfilled'?dates(portfolio.value?.showcases):client.lastPortfolioUpdate,serviceFetchFailed:services.status==='rejected',portfolioFetchFailed:portfolio.status==='rejected',profileFetchedAt:now};
}
export function reorder<T>(items:T[],from:number,to:number){if(from<0||to<0||from>=items.length||to>=items.length)return items;const next=[...items];next.splice(to,0,next.splice(from,1)[0]);return next}

export function clientManager(parent:Node,cfg:Config,save:()=>Promise<void>,refresh?:(c:any)=>Promise<any>){
 const handle=field(parent,'VGen 用户名或主页');const note=field(parent,'客户备注');if(location.origin==='https://vgen.co')button(parent,'填入当前主页',()=>{handle.value=profileSlug(location.href)});const list=el('div','',parent);let editing='';
 const render=()=>{list.replaceChildren();cfg.clients.forEach((client,index)=>{
  const row=el('div','',list);row.className='card';row.draggable=true;row.ondragstart=e=>e.dataTransfer.setData('text/plain',client.id);row.ondragover=e=>e.preventDefault();row.ondrop=async e=>{e.preventDefault();cfg.clients=reorder(cfg.clients,cfg.clients.findIndex(c=>c.id===e.dataTransfer.getData('text/plain')),index);await save();render()};
  const link=el('a',client.displayName||'@'+(client.username||client.handle),row);link.href='https://vgen.co/'+encodeURIComponent(profileSlug(client.username||client.handle));link.target='_blank';link.rel='noreferrer';
  el('p',client.note||'',row);el('small',client.userID?'User ID: '+client.userID:'身份信息尚未刷新',row);
  button(row,'编辑',()=>{editing=client.id;handle.value=client.username||client.handle;note.value=client.note||''});
  button(row,'移除',async()=>{cfg.clients=cfg.clients.filter(c=>c.id!==client.id);await save();render()});
  for(const [label,to]of [['上移',index-1],['下移',index+1]] as [string,number][])button(row,label,async()=>{cfg.clients=reorder(cfg.clients,index,to);await save();render()});
  if(refresh)button(row,'刷新身份与动态',async()=>{const updated=await refresh(client);cfg.clients=cfg.clients.map(c=>c.id===client.id?updated:c);await save();render()});
 });};
 button(parent,'保存客户',async()=>{const username=profileSlug(handle.value);const old=cfg.clients.find(c=>c.id===editing);const c={...old,id:editing||crypto.randomUUID(),username,note:note.value,createdAt:old?.createdAt||new Date().toISOString()};if(editing)cfg.clients=cfg.clients.map(old=>old.id===editing?c:old);else cfg.clients.push(c);editing='';handle.value='';note.value='';await save();render()});
 for(const [key,label,min,max]of [['minHeight','列表可用高度（空列表自动收缩）',120,520],['rowHeight','客户行高度',42,88]] as [string,string,number,number][]){const input=field(parent,label,String(cfg.clientsSettings[key]));input.type='number';input.min=min;input.max=max;input.onchange=async()=>{cfg.clientsSettings[key]=Math.max(min,Math.min(max,Number(input.value)||min));await save()}}
 render();return render;
}

export class ClientsPanel{
 host:HTMLElement;root:ShadowRoot;signature='';refreshing=false;
 constructor(public cfg:Config,public save:()=>Promise<void>,public bridge:(op:string,data?:any)=>Promise<any>,public manage:()=>void){}
 sync(){
  const footer=document.querySelector('[class*="CreatorSidebar__SidebarFooter"]');const sidebar=document.querySelector('[class*="CreatorSidebar__Container"],[class*="DesktopSidebar__Sidebar"],aside[data-nya-sidebar]');
  if(!this.cfg.modules.clients||!sidebar){this.host?.remove();this.host=null;return}
  if(!this.host?.isConnected){const parent=footer?.parentElement||sidebar;const m=mount(parent);this.host=m.host;this.root=m.root;this.host.dataset.nyaClients='';if(footer?.parentElement===this.host.parentElement)footer.before(this.host);this.signature=''}
  const signature=JSON.stringify([this.cfg.clients,this.cfg.clientsSettings,this.cfg.theme]);if(signature===this.signature)return;this.signature=signature;this.render();
  if(this.cfg.clients.some(c=>!c.profileFetchedAt||Date.now()-c.profileFetchedAt>=PROFILE_CACHE_MS))void this.refresh(false);
 }
 async refresh(force:boolean){if(this.refreshing)return;this.refreshing=true;try{for(const c of [...this.cfg.clients]){if(!force&&c.profileFetchedAt&&Date.now()-c.profileFetchedAt<PROFILE_CACHE_MS)continue;try{const value=await this.bridge('profile',{value:{username:c.username||c.handle}});this.cfg.clients=this.cfg.clients.map(old=>old.id===c.id?{...old,...Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined)),id:old.id,note:old.note}:old)}catch(e){c.refreshError=e.message;c.profileFetchedAt=Date.now()-PROFILE_CACHE_MS+15*60000}}await this.save();this.signature='';this.sync()}finally{this.refreshing=false}}
 render(){
  this.root.querySelector('section')?.remove();theme(this.host,this.cfg);
  const panel=el('section','',this.root);panel.className='vgt-panel';panel.dataset.theme=this.host.hasAttribute('data-dark')?'dark':'light';panel.dataset.collapsed=String(this.cfg.clientsSettings.collapsed);panel.dataset.empty=String(!this.cfg.clients.length);panel.setAttribute('aria-label','常用访问');
  const available=Math.max(90,Math.min(this.cfg.clientsSettings.minHeight,Math.round(innerHeight*.36)));
  panel.style.setProperty('--vgt-row-height',this.cfg.clientsSettings.rowHeight+'px');panel.style.setProperty('--nya-clients-list-max',available+'px');
  const shell=el('div','',panel);shell.className='vgt-shell';el('div','',shell).className='vgt-accent';
  const header=el('header','',shell);header.className='vgt-header';const title=el('h2','',header);title.className='vgt-title';el('span','',title).className='vgt-title-dot';el('span','常用访问',title);
  const actions=el('div','',header);actions.className='vgt-header-actions';
  const refresh=button(actions,'',()=>this.refresh(true));refresh.className='vgt-icon-button';setIcon(refresh,'refresh','刷新全部用户资料');
  const manage=button(actions,'',this.manage);manage.className='vgt-icon-button';setIcon(manage,'more','管理常用访问');
  const collapse=button(actions,'',async()=>{this.cfg.clientsSettings.collapsed=!this.cfg.clientsSettings.collapsed;await this.save();this.signature='';this.sync()});collapse.className='vgt-icon-button vgt-collapse';setIcon(collapse,'collapse',this.cfg.clientsSettings.collapsed?'展开常用访问':'折叠常用访问');
  if(this.cfg.clientsSettings.collapsed)return;
  const list=el('ul','',shell);list.className='vgt-list';if(!this.cfg.clients.length)el('li','在管理中添加常用访问',list).className='vgt-empty';
  this.cfg.clients.forEach((c,index)=>{const row=el('li','',list);row.className='vgt-row';row.draggable=true;row.ondragstart=e=>e.dataTransfer.setData('text/plain',c.id);row.ondragover=e=>e.preventDefault();row.ondrop=async e=>{e.preventDefault();this.cfg.clients=reorder(this.cfg.clients,this.cfg.clients.findIndex(c=>c.id===e.dataTransfer.getData('text/plain')),index);await this.save();this.signature='';this.sync()};
   if(remoteImage(c.bannerURL))row.style.backgroundImage=`url("${remoteImage(c.bannerURL)}")`;
   const chat=button(row,'',()=>this.bridge('open-chat',{value:{userID:c.userID,username:c.username}}));chat.className='vgt-avatar-chat';chat.setAttribute('aria-label','私信 @'+c.username);chat.title='私信 @'+c.username;const avatar=remoteImage(c.avatarURL);if(avatar){const image=el('img','',chat);image.src=avatar;image.alt=''}else setIcon(chat,'chat','私信 @'+c.username);
   const link=el('a','',row);link.className='vgt-client-link';link.href='https://vgen.co/'+encodeURIComponent(c.username||c.handle);link.target='_blank';link.rel='noreferrer';
   const meta=el('span','',link);meta.className='vgt-client-text';el('span',c.displayName||'@'+c.username,meta).className='vgt-client-name';const identity=el('span','',meta);identity.className='vgt-client-identity';el('span',c.note||'@'+c.username,identity).className='vgt-client-hint';
   if(c.announcementMessage){const announcement=el('span',c.announcementMessage,meta);announcement.className='vgt-client-announcement';announcement.title=c.announcementMessage}
   const date=(v:any)=>v?new Date(v).toLocaleDateString(): '—';el('span',`服务 ${date(c.lastServiceUpdate)} · 作品 ${date(c.lastPortfolioUpdate)}`,meta).className='vgt-client-updates';row.title=[c.note,c.userID?'User ID: '+c.userID:'',c.refreshError].filter(Boolean).join('\n');
  });
 }
}
