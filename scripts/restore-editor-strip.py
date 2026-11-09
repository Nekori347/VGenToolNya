from pathlib import Path
p=Path('src/editor.ts');s=p.read_text(encoding='utf-8');s=s.replace("import {presetValueKey} from './preset-ui';", "import {presetValueKey} from './preset-ui';\nimport {presetStrip} from './preset-strip';\nimport {setIcon} from './icons';")
s=s.replace('options:{nativeTags?:any[]}={}', 'options:{nativeTags?:any[];manage?:()=>any}={}')
a=s.index(" const bar=el('div'");b=s.index(' const show=async()=>',a)
s=s[:a]+''' const container=el('div','',parent);let box:HTMLElement,source:any,note:any,english:any,back:any,state:any;let original:string|undefined,busy=false;const versions=new Versions();let noteValue='';
 let bar:any;
 const commit=async(value:string)=>{const controls=[...bar.querySelectorAll('button,select')];for(const b of controls)b.disabled=true;try{await write(value)}finally{for(const b of controls)b.disabled=false}};
 const labels={title:'标题预设',description:'描述预设',chat:'聊天预设',order:'订单预设',privateNote:'备注预设',delivery:'交付预设',review:'评价预设'};
 const strip=presetStrip(container,{kind,label:labels[kind]||'文本预设',presets:cfg.presets.filter(p=>p.kind===kind),onPick:async id=>{const preset=cfg.presets.find(p=>p.id===id);if(!preset)return;original=await read();noteValue=preset.note||'';await commit(preset.text)},onSave:async()=>{const name=prompt('预设名称');if(!name?.trim())return;const p={id:crypto.randomUUID(),kind,name:name.trim(),text:await read(),note:noteValue};cfg.presets.push(p);await rpc('save',{config:cfg});strip.refreshOptions(cfg.presets.filter(p=>p.kind===kind))},onManage:options.manage||(()=>rpc('options'))});
 bar=strip.row;const picker=strip.select;
 Promise.resolve(read()).then(current=>{const p=cfg.presets.find(p=>p.kind===kind&&presetValueKey(kind,p.text)===presetValueKey(kind,current));if(p&&!picker.value)picker.value=p.id}).catch(()=>{});
''' +s[b:]
a=s.index(" button(bar,'备注',");s=s[:a]+''' const notes=button(strip.actions,'',async()=>{if(!box)await show();else box.hidden=false;note.focus()});notes.className='vtq-copy-action';setIcon(notes,'note','AI 备注');
 const translate=button(strip.actions,'',show);translate.className='vtq-copy-action';setIcon(translate,'translate','AI 翻译');
 const restore=button(strip.actions,'',async()=>{if(original===undefined)throw Error('尚未插入');await commit(original);if(state)state.textContent='已恢复插入前内容'});restore.className='vtq-copy-action';setIcon(restore,'undo','恢复插入前内容');
 return strip.strip;
}
'''
p.write_text(s,encoding='utf-8')
