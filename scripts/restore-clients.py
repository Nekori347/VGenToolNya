from pathlib import Path
p=Path('src/clients.ts');s=p.read_text(encoding='utf-8');s=s.replace("import {el,button,field,mount,theme} from './ui';", "import {el,button,field,mount,theme} from './ui';\nimport {setIcon} from './icons';")
s=s.replace("const m=mount(sidebar);", "const parent=footer?.parentElement||sidebar;const m=mount(parent);")
s=s.replace("if(footer?.parentElement===sidebar)footer.before(this.host);", "if(footer?.parentElement===this.host.parentElement)footer.before(this.host);")
a=s.index(' render(){',s.index('export class ClientsPanel'))
s=s[:a]+''' render(){
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
   const date=(v:any)=>v?new Date(v).toLocaleDateString(): '—';el('span',`服务 ${date(c.lastServiceUpdate)} · 作品 ${date(c.lastPortfolioUpdate)}`,meta).className='vgt-client-updates';row.title=[c.note,c.userID?'User ID: '+c.userID:'',c.refreshError].filter(Boolean).join('\\n');
  });
 }
}
'''
p.write_text(s,encoding='utf-8')
p=Path('src/ui.ts');s=p.read_text(encoding='utf-8');s=s.replace("import {extraCSS} from './extra-style';", "import {extraCSS} from './extra-style';\nimport {legacyCSS} from './legacy-ui';");s=s.replace("css+extraCSS,root", "css+extraCSS+legacyCSS,root");s=s.replace('双语（悬停原文）','双语（上下对照）');s=s.replace("el('summary','统一预设管理',presets);", "presets.dataset.section='presets';el('summary','统一预设管理',presets);");s=s.replace("el('summary','常用客户',clients);", "clients.dataset.section='clients';el('summary','常用访问',clients);");s=s.replace("el('summary','AI 服务商与模型',api);", "api.dataset.section='api';el('summary','AI 服务商与模型',api);");p.write_text(s,encoding='utf-8')
