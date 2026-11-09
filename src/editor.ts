import {el,button,field,rpc} from './ui';
import {Versions,Config} from './core';
import {plainText} from './native-fields';
import {presetValueKey} from './preset-ui';
import {presetStrip} from './preset-strip';
import {setIcon} from './icons';

export function editor(parent:Node,cfg:Config,kind:string,read:()=>string|Promise<string>,write:(s:string)=>Promise<void>,options:{nativeTags?:any[];manage?:()=>any}={}){
 const container=el('div','',parent);let box:HTMLElement,source:any,note:any,english:any,back:any,state:any;let original:string|undefined,busy=false;const versions=new Versions();let noteValue='';
 let bar:any;
 const commit=async(value:string)=>{const controls=[...bar.querySelectorAll('button,select')];for(const b of controls)b.disabled=true;try{await write(value)}finally{for(const b of controls)b.disabled=false}};
 const labels={title:'标题预设',description:'描述预设',chat:'聊天预设',order:'订单预设',privateNote:'备注预设',delivery:'交付预设',review:'评价预设'};
 const strip=presetStrip(container,{kind,label:labels[kind]||'文本预设',presets:cfg.presets.filter(p=>p.kind===kind),onPick:async id=>{const preset=cfg.presets.find(p=>p.id===id);if(!preset)return;original=await read();noteValue=preset.note||'';if(note)note.value=noteValue;await commit(preset.text)},onSave:async()=>{const name=prompt('预设名称');if(!name?.trim())return;const p={id:crypto.randomUUID(),kind,name:name.trim(),text:await read(),note:noteValue};cfg.presets.push(p);await rpc('save',{config:cfg});strip.refreshOptions(cfg.presets.filter(p=>p.kind===kind))},onManage:options.manage||(()=>rpc('options'))});
 bar=strip.row;const picker=strip.select;
 Promise.resolve(read()).then(current=>{const p=cfg.presets.find(p=>p.kind===kind&&presetValueKey(kind,p.text)===presetValueKey(kind,current));if(p&&!picker.value)picker.value=p.id}).catch(()=>{});
 const show=async()=>{
  if(box){box.hidden=!box.hidden;return}
  box=el('section','',parent);box.className='editor';el('p',cfg.mock?'模拟响应 · 仅使用固定翻译样例与中性评价变体':'生成时仅发送本编辑器原文、备注和所选标签到已配置服务商',box).className='muted';
  source=field(box,kind==='review'?'评价意图 / 已发生的合作事实':'原文',kind==='review'?cfg.reviewIntent:plainText(await read()),'textarea');
  note=field(box,'AI 备注（不插入正文）',kind==='review'?cfg.reviewTone:noteValue,'textarea');note.oninput=()=>{noteValue=note.value};
  const selectedTags=new Set<string>();if(kind==='review'){
   const tags=el('fieldset','',box);el('legend','原生评价标签',tags);
   if(!options.nativeTags?.length)el('p','原生标签尚未挂载；载入原生评价选项后重新展开工具可读取。自定义标签可独立使用。',tags).className='muted';
   for(const tag of options.nativeTags||[]){const label=el('label',tag.label||tag.id,tags);label.className='check';const checkbox=el('input','',label);checkbox.type='checkbox';checkbox.onchange=()=>checkbox.checked?selectedTags.add(tag.id):selectedTags.delete(tag.id)}
  }
  const customTags=kind==='review'?field(box,'自定义标签（逗号分隔）'):null;
  english=field(box,'英文结果','','textarea');back=field(box,'独立中文直译','','textarea');back.readOnly=true;state=el('p','',box);state.setAttribute('role','status');
  const sync=()=>{english.value=versions.current.english;back.value=versions.current.back};
  const run=async(task:string)=>{
   if(busy)throw Error('生成中，请等待当前结果');busy=true;state.textContent='生成中…';
   try{const result=await rpc('ai',{payload:{task,text:task==='polish'?english.value:source.value,note:note.value,tags:[...selectedTags,...(customTags?.value||'').split(/[,，]/).map(s=>s.trim()).filter(Boolean)],variation:crypto.randomUUID()}});const literal=await rpc('ai',{payload:{task:'back',text:result}});versions.set(result,literal);sync();state.textContent='完成；仅点击插入才会修改原生字段'}catch(e){state.textContent=e.message;throw e}finally{busy=false}
  };
  button(box,kind==='review'?'生成 / 重新生成':'翻译 / 重新翻译',()=>run(kind==='review'?'review':'translate')).className='primary';
  button(box,'润色',()=>{if(!english.value)throw Error('请先生成英文');return run('polish')});
  english.oninput=()=>{back.value='英文已修改，请更新独立直译后插入'};
  button(box,'更新中文直译',async()=>{if(busy)throw Error('请等待当前生成');if(!english.value.trim())throw Error('请输入英文');busy=true;try{versions.set(english.value,await rpc('ai',{payload:{task:'back',text:english.value}}));sync()}finally{busy=false}});
  button(box,'撤回 / 复原译文',()=>{if(busy)throw Error('请等待当前生成');versions.swap();sync()});
  button(box,'插入',async()=>{if(busy)throw Error('请等待当前生成');if(!english.value||english.value!==versions.current.english||!versions.current.back)throw Error('请先更新中文直译');const before=await read();original=before;await commit(english.value);state.textContent='已插入；未发送或提交'}).className='primary';
 };
 const notes=button(strip.actions,'',async()=>{if(!box)await show();else box.hidden=false;note.focus()});notes.className='vtq-copy-action';setIcon(notes,'note','AI 备注');
 const translate=button(strip.actions,'',show);translate.className='vtq-copy-action';setIcon(translate,'translate','AI 翻译');
 const restore=button(strip.actions,'',async()=>{if(original===undefined)throw Error('尚未插入');await commit(original);if(state)state.textContent='已恢复插入前内容'});restore.className='vtq-copy-action';setIcon(restore,'undo','恢复插入前内容');
 return strip.strip;
}
