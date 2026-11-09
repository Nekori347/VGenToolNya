from pathlib import Path
p=Path('src/preset-ui.ts');s=p.read_text(encoding='utf-8');s=s.replace("import {reorder} from './clients';", "import {reorder} from './clients';\nimport {presetStrip} from './preset-strip';\nimport {setIcon} from './icons';\nimport {rpc} from './ui';")
a=s.index('\nexport function uploadTools(')
s=s[:a]+'''
export function uploadTools(parent:Node,cfg:Config,f:any,bridge:(op:string,data?:any)=>Promise<any>,save:()=>Promise<void>,manage:()=>any=()=>rpc('options')){
 const read=()=>bridge('read',{field:f.id});const write=(value:any)=>bridge('write',{field:f.id,value:typeof value==='string'?value:JSON.stringify(value)});
 const saveCurrent=async()=>{const name=prompt('预设名称');if(!name)return;cfg.presets.push({id:crypto.randomUUID(),kind:f.kind,name,text:await read(),note:'',schema:f.schema||[]});await save()};
 if(!['tags','serviceTags'].includes(f.kind)){
  const strip=presetStrip(parent,{kind:f.kind,label:f.kind==='global'?'全局预设':'发现标签预设',presets:cfg.presets.filter(p=>p.kind===f.kind),onPick:async id=>{const p=cfg.presets.find(p=>p.id===id);if(p)await write(p.text)},onSave:async()=>{await saveCurrent();strip.refreshOptions(cfg.presets.filter(p=>p.kind===f.kind))},onManage:manage});
  const matching=cfg.presets.find(p=>p.kind===f.kind&&presetValueKey(p.kind,p.text)===presetValueKey(f.kind,f.value));if(matching)strip.select.value=matching.id;return;
 }
 const panel=el('section','',parent);panel.className='vtq-panel vtq-tags-panel';let generation=0;
 const render=async()=>{const ticket=++generation;const current=tagNames(JSON.parse(await read()));if(ticket!==generation)return;panel.replaceChildren();
  const header=el('header','',panel);header.className='vtq-header';const heading=el('div','',header);el('strong','搜索标签预设',heading);el('small',`${cfg.presets.filter(p=>p.kind===f.kind).length} 个分类 · 已选 ${current.length}`,heading).className='muted';const actions=el('div','',header);actions.className='vtq-copy-strip-actions';
  for(const [icon,label,action]of [['add','保存当前搜索标签',async()=>{await saveCurrent();await render()}],['settings','管理搜索标签预设',manage],['close','清空全部搜索标签',async()=>{await write([]);await render()}],['collapse',cfg.groupExpanded['__panel_'+f.kind]===false?'展开标签面板':'折叠标签面板',async()=>{cfg.groupExpanded['__panel_'+f.kind]=cfg.groupExpanded['__panel_'+f.kind]===false;await save();await render()}]] as [string,string,()=>any][]){const b=button(actions,'',action);b.className='vtq-copy-action';setIcon(b,icon,label)}
  if(cfg.groupExpanded['__panel_'+f.kind]===false)return;const body=el('div','',panel);body.className='vtq-body';
  const groups=cfg.presets.filter(p=>p.kind===f.kind);if(!groups.length)el('div','暂无分类，点击齿轮管理标签预设。',body).className='vtq-empty';
  for(const p of groups){const tags=JSON.parse(p.text);const names=tagNames(tags);const selected=names.filter(t=>current.includes(t)).length;const expanded=cfg.groupExpanded[p.id]!==false;
   const group=el('section','',body);group.className='vtq-group';group.dataset.expanded=String(expanded);const head=el('div','',group);head.className='vtq-group-heading';const toggle=button(head,(expanded?'▾ ':'▸ ')+p.name,async()=>{cfg.groupExpanded[p.id]=!expanded;await save();await render()});toggle.className='vtq-group-toggle';el('span',`${selected}/${names.length}`,head).className='vtq-group-count';
   const ops=el('div','',head);ops.className='vtq-group-actions';const add=button(ops,'＋',async()=>{await write([...new Set([...tagNames(JSON.parse(await read())),...names])]);await render()});add.className='vtq-copy-action';add.setAttribute('aria-label','添加整组 '+p.name);add.title='整组添加';const remove=button(ops,'−',async()=>{await write(tagNames(JSON.parse(await read())).filter(t=>!names.includes(t)));await render()});remove.className='vtq-copy-action';remove.setAttribute('aria-label','移除整组 '+p.name);remove.title='整组移除';
   const progress=el('div','',group);progress.className='vtq-group-progress';el('span','',progress).className='vtq-group-progress-fill';progress.firstElementChild.style.width=(names.length?selected/names.length*100:0)+'%';
   if(expanded){const chips=el('div','',group);chips.className='vtq-tags';for(const item of tags){const tag=tagName(item);const chip=button(chips,tag,async()=>{const values=tagNames(JSON.parse(await read()));await write(values.includes(tag)?values.filter(t=>t!==tag):[...values,tag]);await render()});chip.title=item.note||tag;chip.setAttribute('aria-pressed',String(current.includes(tag)))}}
  }
 };
 panel.addEventListener('nya-sync',()=>{void render()});void render();
}
'''
p.write_text(s,encoding='utf-8')
p=Path('src/extra-style.ts');s=p.read_text(encoding='utf-8');s+='\nexport const tagPanelCSS=`.vtq-panel{position:relative;border:1px solid var(--line);border-radius:14px;background:var(--card);overflow:hidden;margin:6px 0}.vtq-panel::before{content:"";display:block;height:3px;background:linear-gradient(90deg,var(--blue),var(--green))}.vtq-header{display:flex;justify-content:space-between;align-items:center;padding:9px 10px;gap:8px;background:var(--soft);border-bottom:1px solid var(--line)}.vtq-header strong{font-size:13px;font-weight:800}.vtq-header small{display:block;margin-top:2px}.vtq-body{padding:8px}.vtq-empty{padding:14px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);text-align:center;font-size:11px}`;\n';p.write_text(s,encoding='utf-8')
p=Path('src/ui.ts');s=p.read_text(encoding='utf-8');s=s.replace('import {extraCSS}', 'import {extraCSS,tagPanelCSS}');s=s.replace('css+extraCSS+legacyCSS,root','css+extraCSS+legacyCSS+tagPanelCSS,root');p.write_text(s,encoding='utf-8')
