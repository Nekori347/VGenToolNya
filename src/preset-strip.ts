import {el,button} from './ui';
import {setIcon} from './icons';
import type {Preset} from './core';
export function presetStrip(parent:Node,options:{kind:string;label:string;presets:Preset[];onPick:(id:string)=>Promise<any>;onSave:()=>any;onManage:()=>any;onRefresh?:()=>any}){
 const strip=el('section','',parent);strip.className='vtq-copy-strip'+(options.kind==='global'?' nya-global':'');
 if(options.kind==='global'){const brand=el('div','',strip);brand.className='vtq-global-brand';el('span','VGenToolNya',brand).className='vtq-global-plugin-name';el('span','by @Nekori_Net · v0.1',brand).className='vtq-global-plugin-meta'}
 const row=el('div','',strip);row.className='vtq-copy-strip-row';el('span',options.label,row).className='vtq-copy-label vtq-dropdown-label';
 const select=el('select','',row);select.className='vtq-preset-select';select.setAttribute('aria-label','选择'+options.label);
 const refreshOptions=(presets=options.presets)=>{select.replaceChildren();el('option',presets.length?`选择预设（${presets.length}）…`:'暂无预设',select).value='';for(const p of presets){const option=el('option',p.name,select);option.value=p.id;option.title=p.note||''}select.disabled=!presets.length};refreshOptions();
 select.onchange=async()=>{if(!select.value)return;select.disabled=true;try{await options.onPick(select.value)}catch(e){el('p',e.message,strip).className='error'}finally{select.disabled=!select.options.length||select.options.length===1}};
 const actions=el('div','',row);actions.className='vtq-copy-strip-actions';
 for(const [icon,label,action]of [['add','把当前内容保存为'+options.label,options.onSave],['refresh','刷新全部预设',options.onRefresh||(()=>refreshOptions())],['settings','管理'+options.label,options.onManage]] as [string,string,()=>any][]){const b=button(actions,'',action);b.className='vtq-copy-action';setIcon(b,icon,label)}
 return {strip,row,select,actions,refreshOptions};
}
