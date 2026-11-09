import catalog from './locale/source-catalog.json';
import {classifyUI,pageKind} from './locale/context';
import {lookupUI,normalizeUI} from './locale/catalog';
import {TermsManager} from './locale/reports';
import {publicAssetURL} from './locale/sources';
import {bilingualSelect,pruneSelects,syncSelects,selectCSS} from './locale/select';
import {styleSecondary} from './locale/appearance';
type State={en:string;rendered:string;hint?:HTMLElement;parent?:Element};
const texts=new Map<Text,State>(),attrs=new Map<Element,Map<string,State>>();
const ownText=new WeakMap<Text,string>(),ownAttr=new WeakMap<Element,Map<string,string>>();
const pending=new Set<Node>();const source=new Set<string>();const manager=new TermsManager();
let mode='zh',route='',started=false,flushTimer:any,reportTimer:any,assetTimer:any;
let overrides:Record<string,string>={};
const entries=Array.isArray(catalog)?catalog:Object.keys(catalog);
for(const t of entries)source.add(normalizeUI(typeof t==='string'?t:t.text));
function approved(text:string,element:Element){if(source.has(normalizeUI(text)))return true;const c=classifyUI(element,true);return !!c&&lookupUI(text,c.page,c.component,overrides)!==null}
function setText(node:Text,value:string){if(node.data!==value){ownText.set(node,value);node.data=value}}
function setAttr(e:Element,name:string,value:string){if(e.getAttribute(name)!==value){let m=ownAttr.get(e);if(!m){m=new Map();ownAttr.set(e,m)}m.set(name,value);e.setAttribute(name,value)}}
function cleanup(s:State){const row=s.hint?.parentElement;s.hint?.remove();if(row?.hasAttribute('data-nya-rich-caption')&&!row.children.length)row.remove();s.hint=undefined;const p=s.parent;if(p&&!p.querySelector(':scope > [data-nya-i18n]')){p.removeAttribute('data-nya-locale-layout');p.removeAttribute('data-nya-locale-component')}s.parent=undefined}
const captionSources=new WeakMap<Element,Text>();
function richTextRoot(node:Text){const root=node.parentElement?.closest('p,h1,h2,h3,h4,h5,.title,.description,.subtitle');if(!root||root.querySelector('input,textarea,select,button,svg,img,[contenteditable],[data-user-content]'))return null;const elements=[...root.querySelectorAll('*')].filter(e=>!e.closest('[data-nya-i18n]'));if(!elements.length||elements.some(e=>!e.matches('span,strong,b,em,i,a,br')))return null;return root as HTMLElement}
function stack(node:Text,s:State,zh:string,component:string){
 const p=node.parentElement;if(!p)return;cleanup(s);const hint=document.createElement('small');hint.dataset.nyaI18n='';hint.textContent=zh;hint.setAttribute('aria-hidden','true');
 const rich=richTextRoot(node);if(rich){let row=rich.querySelector<HTMLElement>(':scope > [data-nya-rich-caption]');if(!row){row=document.createElement('span');row.dataset.nyaI18n='';row.dataset.nyaRichCaption='';rich.append(row)}captionSources.set(hint,node);const next=[...row.children].find(e=>!!(node.compareDocumentPosition(captionSources.get(e))&Node.DOCUMENT_POSITION_FOLLOWING));if(next)row.insertBefore(hint,next);else row.append(hint);rich.setAttribute('data-nya-locale-layout','rich');s.hint=hint;s.parent=rich;return}
 // Keep React-owned text nodes in place; only add a removable secondary sibling.
 const hasControl=!!p.querySelector('input,textarea,select');const siblings=[...p.children].filter(e=>!e.hasAttribute('data-nya-i18n'));
 const icons=siblings.length>0&&siblings.every(e=>e.matches('svg,img,[class*="Icon"]'));
 p.setAttribute('data-nya-locale-layout',hasControl?'field':icons?'icons':siblings.length===0?'label':'mixed');p.setAttribute('data-nya-locale-component',component);node.after(hint);s.hint=hint;s.parent=p;
}
function processText(node:Text){
 if(!node.isConnected||!node.parentElement)return;let s=texts.get(node);if(s&&node.data!==s.rendered){cleanup(s);texts.delete(node);s=undefined}
 const en=s?.en??node.data;if(!en.trim())return;const c=classifyUI(node.parentElement,approved(en,node.parentElement));
 if(!c){if(s){cleanup(s);if(node.data===s.rendered)setText(node,s.en);texts.delete(node)}return}
 const zh=lookupUI(en,c.page,c.component,overrides);manager.record(node,c,normalizeUI(en),zh);
 if(!zh){if(s){cleanup(s);setText(node,s.en);texts.delete(node)}return}if(!s){s={en,rendered:en};texts.set(node,s)}
 const value=mode==='zh'?en.replace(en.trim(),zh):en;
 if(s.hint&&(mode!=='bilingual'||s.hint.textContent!==zh||!s.hint.isConnected))cleanup(s);setText(node,value);s.rendered=value;
 if(mode==='bilingual'&&!s.hint&&!node.parentElement.matches('option'))stack(node,s,zh,c.component);
 if(mode==='bilingual'&&s.hint)styleSecondary(s.hint,node.parentElement);
}
function processAttributes(e:Element){if(e instanceof HTMLSelectElement&&!e.closest('[data-nya]'))bilingualSelect(e,mode==='bilingual'&&!!e.closest('[class*="Select__"]')&&!!classifyUI(e,true),o=>{const n=[...o.childNodes].find(n=>n.nodeType===3)as Text;const en=texts.get(n)?.en||o.textContent;const c=classifyUI(o,true);return {en,zh:c?lookupUI(en,c.page,c.component,overrides):null}});for(const name of ['placeholder','aria-label','title']){
 let m=attrs.get(e),s=m?.get(name);const value=e.getAttribute(name);if(!value)continue;if(s&&s.rendered!==value){cleanup(s);m.delete(name);s=undefined}
 const en=s?.en??value,c=classifyUI(e,approved(en,e),name);if(!c)continue;const zh=lookupUI(en,c.page,c.component,overrides);manager.record(e,c,normalizeUI(en),zh);if(!zh)continue;
 if(!m){m=new Map();attrs.set(e,m)}if(!s){s={en,rendered:en};m.set(name,s)}if(name==='placeholder')e.setAttribute('data-nya-original',en);const next=mode==='zh'?zh:en;setAttr(e,name,next);s.rendered=next;
 if(name==='placeholder'){cleanup(s);const container=e.closest('label,[class*="InputField__Container"],.formLabel');if(mode==='bilingual'&&container){const hint=document.createElement('small');hint.dataset.nyaI18n='';hint.dataset.nyaPlaceholder='';hint.textContent=zh;container.append(hint);styleSecondary(hint,e);s.hint=hint}}
}}
function scan(root:Node){if(!root.isConnected)return;if(root.nodeType===Node.TEXT_NODE){processText(root as Text);return}if(!(root instanceof Element))return;if(root.closest('[data-nya],[data-vgen-nya-ui],[data-nya-i18n]'))return;processAttributes(root);
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(n){return n instanceof Element&&n.matches('script,style,noscript,[data-nya],[data-vgen-nya-ui],[data-nya-i18n],[contenteditable],[data-user-content],.str-chat__message')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}});
 for(let n=walker.nextNode();n;n=walker.nextNode())if(n.nodeType===Node.TEXT_NODE)processText(n as Text);else if(n instanceof Element)processAttributes(n);
}
function publish(){clearTimeout(reportTimer);reportTimer=setTimeout(()=>{chrome.runtime.sendMessage({type:'locale-report',report:localeReport()}).catch(()=>{})},800)}
function flush(){flushTimer=null;const roots=[...pending];pending.clear();for(const n of roots)if(!roots.some(p=>p!==n&&p.contains(n)))scan(n);for(const [n,s]of texts)if(!n.isConnected){cleanup(s);texts.delete(n)}for(const [e,m]of attrs)if(!e.isConnected){for(const s of m.values())cleanup(s);attrs.delete(e)}pruneSelects();publish()}
function enqueue(root:Node){pending.add(root);if(!flushTimer)flushTimer=setTimeout(flush,40)}
const fetched=new Set<string>();
const assetURLs=new Set<string>();
function collectAssets(values:string[]){let changed=false;for(const value of values){const url=publicAssetURL(value);if(url&&!assetURLs.has(url)){assetURLs.add(url);changed=true}}if(changed){clearTimeout(assetTimer);assetTimer=setTimeout(()=>void discoverSources(),200)}}
async function discoverSources(){for(const value of [...document.scripts].map(s=>s.src).concat(performance.getEntriesByType('resource').map(e=>e.name))){const url=publicAssetURL(value);if(url)assetURLs.add(url)}const urls=[...assetURLs].filter(u=>!fetched.has(u));for(const u of urls)fetched.add(u);if(!urls.length)return;
 try{const r=await chrome.runtime.sendMessage({type:'locale-sources',urls});if(r?.ok){for(const term of r.value)source.add(normalizeUI(term));enqueue(document.body)}}catch{for(const u of urls)fetched.delete(u)}
}
export function localeReport(){return {...manager.report(),sources:{publicAssetsRequested:fetched.size,approvedLiterals:source.size}}}
export function clearLocaleReport(){manager.clear();enqueue(document.body)}
export function configureLocale(values:Record<string,string>){overrides=values||{};manager.revalidate(t=>lookupUI(t.text,t.page,t.component,overrides));enqueue(document.body)}
export function handleLocaleMutations(records:MutationRecord[]){for(const r of records){const target=r.target,e=target instanceof Element?target:target.parentElement;if(e?.closest('[data-nya],[data-vgen-nya-ui],[data-nya-i18n]'))continue;
 if(r.type==='characterData'){if(ownText.get(target as Text)===(target as Text).data){ownText.delete(target as Text);continue}enqueue(target)}
 else if(r.type==='attributes'){if(r.attributeName.startsWith('data-nya-'))continue;if(target===document.documentElement){enqueue(document.body);continue}const m=ownAttr.get(target as Element);if(m?.get(r.attributeName)===(target as Element).getAttribute(r.attributeName)){m.delete(r.attributeName);continue}if(['placeholder','title','aria-label','class','disabled'].includes(r.attributeName))enqueue(target)}
 else {for(const n of r.addedNodes){if(n instanceof HTMLScriptElement)collectAssets([n.src]);if(!(n instanceof Element&&n.hasAttribute('data-nya-i18n')))enqueue(n)}if([...r.removedNodes].some(n=>n.nodeType===Node.TEXT_NODE))enqueue(target)}
}}
export function localize(value:string){syncSelects();const changed=mode!==value||route!==location.pathname;mode=value;route=location.pathname;
 if(!started){started=true;enqueue(document.body);void discoverSources();new PerformanceObserver(list=>collectAssets(list.getEntries().map(e=>e.name))).observe({type:'resource',buffered:true});matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>requestAnimationFrame(()=>enqueue(document.body)))}
 else if(changed){for(const [n]of texts)processText(n);for(const [e]of attrs)processAttributes(e);enqueue(document.body);void discoverSources()}
}
export const bilingualCSS=selectCSS+`
[data-nya-i18n]{display:block;font-size:10px;line-height:1.3;font-weight:400;color:var(--theme-GRAY-DARK,#737b88);letter-spacing:normal;text-transform:none;white-space:normal;overflow-wrap:anywhere;pointer-events:none;flex-shrink:0}
@media(prefers-color-scheme:dark){[data-nya-i18n]{color:var(--theme-GRAY-DARK,#a4adbb)}}
[data-theme="dark"] [data-nya-i18n]{color:var(--theme-GRAY-DARK,#a4adbb)}
[data-nya-locale-layout="label"]{display:inline-flex;flex-direction:column;justify-content:center;align-items:inherit;white-space:normal;height:auto;min-height:min-content}
button[data-nya-locale-layout],a[data-nya-locale-layout],[role="menuitem"][data-nya-locale-layout]{height:auto;white-space:normal;min-height:32px;padding-top:4px;padding-bottom:4px}
[data-nya-locale-layout="icons"]{display:inline-grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;column-gap:6px;white-space:normal;height:auto}
[data-nya-locale-layout="icons"]>svg,[data-nya-locale-layout="icons"]>img,[data-nya-locale-layout="icons"]>[class*="Icon"]{grid-row:1 / 3;grid-column:1}
[data-nya-locale-layout="icons"]>[data-nya-i18n]{grid-row:2;grid-column:2;text-align:inherit}
[data-nya-locale-layout="field"]>[data-nya-i18n],[data-nya-placeholder]{display:block;margin-top:2px}
nav [data-nya-locale-layout],aside [data-nya-locale-layout]{flex-shrink:0}
body [data-nya-locale-component="FieldLabel"][data-nya-locale-layout="label"]{align-items:flex-start;text-align:left;justify-content:center}
[data-nya-locale-layout="rich"]{display:block}
[data-nya-rich-caption]{display:block;width:100%;font-size:10px;line-height:1.3;font-weight:400}
[data-nya-rich-caption]>small{display:inline;font-size:inherit;line-height:inherit}
`;
