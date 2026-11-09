import {CLIENT_REVIEW_TAGS} from './review-tags';
export function ownReact(node:any,prefix:string){const key=Object.getOwnPropertyNames(node||{}).find(k=>k.startsWith(prefix));return key?node[key]:null}
export function fieldLabel(element:any){
 const propsLabel=walkReact(element,p=>{if(!p||typeof p.onChange!=='function'&&!p.fieldName)return null;const parts=['fieldName','name','placeholder','aria-label','label'].map(k=>p[k]).filter(v=>typeof v==='string');return parts.length?parts.join(' '):null});
 return [propsLabel,element.getAttribute('name'),element.getAttribute('placeholder'),element.getAttribute('aria-label'),element.getAttribute('data-nya-original'),element.closest('label')?.textContent].filter(Boolean).join(' ');
}
export function isWritableField(element:any){return !element.disabled&&!element.readOnly&&element.getAttribute?.('aria-disabled')!=='true'&&element.getAttribute?.('data-slate-readonly')!=='true'&&!element.closest?.('fieldset[disabled]')}
export function walkReact<T>(element:any,visit:(props:any,fiber:any)=>T):T{
 for(let node=element,n=0;node&&n<12;node=node.parentElement,n++){
  const direct=visit(ownReact(node,'__reactProps$'),null);if(direct)return direct;
  for(let f=ownReact(node,'__reactFiber$')||ownReact(node,'__reactInternalInstance$'),d=0;f&&d<60;f=f.return,d++)for(const c of [f,f.alternate].filter(Boolean)){const result=visit(c.memoizedProps||c.pendingProps,c);if(result)return result}
 }return null;
}
export function nativeStore(element:any){return walkReact(element,(props,fiber)=>{
 const values=[props,props?.store,props?.value,props?.value?.store,fiber?.stateNode];for(let dep=fiber?.dependencies?.firstContext,n=0;dep&&n<20;dep=dep.next,n++)values.push(dep.memoizedValue,dep.memoizedValue?.store);
 return values.find(v=>typeof v?.getState==='function'&&typeof v?.dispatch==='function');
})}
export function slateEditor(element:any){return walkReact(element,(props,fiber)=>{
 const candidates=[props?.editor,props?.value];for(let hook=fiber?.memoizedState,n=0;hook&&n<40;hook=hook.next,n++)candidates.push(hook.memoizedState,hook.memoizedState?.current);
 return candidates.find(v=>Array.isArray(v?.children)&&typeof v.apply==='function');
})}
export function plainText(serialized:string){try{const nodes=JSON.parse(serialized);if(Array.isArray(nodes)){const text=(n:any):string=>typeof n.text==='string'?n.text:(n.children||[]).map(text).join('');return nodes.map(text).join('\n')}}catch{}return serialized}
export function textTarget(element:any){
 if(!isWritableField(element))return null;
 const slate=element.matches?.('[contenteditable]')?slateEditor(element):null;
 if(slate)return {read:()=>JSON.stringify(slate.children),write:async(value:string)=>{if(!isWritableField(element))throw Error('当前字段不可编辑');let nodes;try{nodes=JSON.parse(value)}catch{nodes=null}if(!Array.isArray(nodes))nodes=value.split('\n').map(text=>({type:'paragraph',children:[{text}]}));const apply=()=>{for(let i=slate.children.length-1;i>=0;i--)slate.apply({type:'remove_node',path:[i],node:slate.children[i]});nodes.forEach((node,index)=>slate.apply({type:'insert_node',path:[index],node}));};if(slate.withoutNormalizing)slate.withoutNormalizing(apply);else apply();slate.onChange?.();await new Promise(r=>setTimeout(r,100));if(plainText(JSON.stringify(slate.children))!==plainText(JSON.stringify(nodes)))throw Error('Slate 状态确认失败')}};
 if('value'in element){const handler=ownReact(element,'__reactProps$')?.onChange||walkReact(element,p=>typeof p?.onChange==='function'?p.onChange:null);if(!handler)return null;
 return {read:()=>String(element.value),write:async(value:string)=>{if(!isWritableField(element))throw Error('当前字段不可编辑');const proto=element instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);await handler({target:element,currentTarget:element,type:'change'});for(let attempt=0;attempt<16;attempt++){await new Promise(r=>setTimeout(r,50));const current=ownReact(element,'__reactProps$');if(element.value===value&&(!current||!Object.hasOwn(current,'value')||String(current.value??'')===value))return}throw Error('原生字段未接受内容')}}}
 return null;
}

export function reviewTarget(element:any){
 if(!element.closest?.('.clientReview')&&!/clientReview/.test(element.className||'')&&!/semi-public review/i.test(element.getAttribute?.('placeholder')||element.getAttribute?.('data-nya-original')||'')&&!element.matches?.('[data-native-review="client"]'))return null;
 const store=nativeStore(element);if(!store)return null;const state=store.getState();const candidates=Object.entries(state||{}).filter(([key,v]:any)=>/client.?review/i.test(key)&&v?.body&&'wouldRecommend'in v.body&&Array.isArray(v.body.notables));if(!candidates.length)return null;const key=candidates[0][0];
 return {read:()=>String(store.getState()[key].body.reviewText||''),write:async(value:string)=>{store.dispatch({type:'CLIENT-REVIEW/UPDATE-REVIEW-TEXT',reviewText:value});if(store.getState()[key].body.reviewText!==value)throw Error('原生评价状态未接受内容')},tags:()=>{
  const choices=new Map<string,any>();const scope=element.closest('[role="dialog"],form')||element.parentElement;
  for(const control of scope.querySelectorAll('button,input,label,[role="checkbox"]'))walkReact(control,(p)=>{for(const candidate of [p?.notable,p?.difficulty,...(Array.isArray(p?.options)?p.options:[]),...(Array.isArray(p?.notables)?p.notables:[])]){if(typeof candidate==='string')choices.set(candidate,{id:candidate,label:candidate});else if(candidate&&typeof candidate==='object'){const id=candidate.value||candidate.name||candidate.id;const label=candidate.label||candidate.text||id;if(typeof id==='string'&&typeof label==='string')choices.set(id,{id,label})}}return null});
  const body=store.getState()[key].body;for(const id of [...body.notables,...body.difficulties])if(typeof id==='string'&&!choices.has(id))choices.set(id,{id,label:id});for(const tag of CLIENT_REVIEW_TAGS)if(!choices.has(tag.id))choices.set(tag.id,tag);return [...choices.values()];
 }};
}
