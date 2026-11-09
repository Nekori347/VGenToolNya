import type {UIContext} from './context';
export type Term=UIContext&{text:string;translation:string|null;observations:number};
/** Only callers with a classified native UI context may record a term. */
export class TermsManager {
 private terms=new Map<string,Term>();private seen=new WeakMap<Node,Set<string>>();
 record(node:Node,context:UIContext,text:string,translation:string|null){const key=[context.page,context.component,context.field,text].join('|');let set=this.seen.get(node);if(!set){set=new Set();this.seen.set(node,set)}const term=this.terms.get(key)||{...context,text,translation,observations:0};term.translation=translation;if(!set.has(key)){term.observations++;set.add(key)}this.terms.set(key,term)}
 revalidate(lookup:(term:Term)=>string|null){for(const term of this.terms.values())term.translation=lookup(term)}
 clear(){this.terms.clear();this.seen=new WeakMap()}
 report(){const terms=[...this.terms.values()].sort((a,b)=>[a.page,a.component,a.text].join().localeCompare([b.page,b.component,b.text].join()));const pages:Record<string,{hit:number;miss:number}>={};for(const t of terms){const p=pages[t.page]??={hit:0,miss:0};p[t.translation===null?'miss':'hit']++}return {version:1,scope:'classified-native-ui-only',pages,hit:terms.filter(t=>t.translation!==null).length,miss:terms.filter(t=>t.translation===null).length,terms}}
}
