import {defineBackground} from 'wxt/utils/define-background';
import {configWithDefaults,generate,endpoint,permissionOrigin} from '../src/core';
import {refreshProfile} from '../src/clients';
import {publicAssetURL,extractUILiterals} from '../src/locale/sources';
const sourceCache=new Map<string,Promise<string[]>>();
export default defineBackground(()=>{
 chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
 chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(sender.id!==chrome.runtime.id)return;
  (async()=>{
   const saved:any=await chrome.storage.local.get(['config','apiKey','apiKeys']);const cfg=configWithDefaults(saved.config);
   if(msg.type==='load')return cfg;
   if(msg.type==='locale-sources'){
    const urls=[...new Set<string>((msg.urls||[]).map(publicAssetURL).filter(Boolean))];const terms=new Set<string>();
    for(let i=0;i<urls.length;i+=6)await Promise.all(urls.slice(i,i+6).map(async url=>{if(!sourceCache.has(url))sourceCache.set(url,(async()=>{const response=await fetch(url,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('静态资源不可用');return extractUILiterals(await response.text()).map(t=>t.text)})().catch(()=>{sourceCache.delete(url);return []}));for(const t of await sourceCache.get(url))terms.add(t)}));return [...terms];
   }
   if(msg.type==='locale-report'){if(!sender.tab)return false;const previous:any=await chrome.storage.local.get('localeReports');const reports=previous.localeReports||{};for(const page of Object.keys(msg.report.pages||{}))reports[page]={...msg.report,terms:msg.report.terms.filter(t=>t.page===page),pages:{[page]:msg.report.pages[page]}};await chrome.storage.local.set({localeReports:reports});return true}
   if(msg.type==='locale-reports')return (await chrome.storage.local.get('localeReports')).localeReports||{};
   if(msg.type==='options'){await chrome.runtime.openOptionsPage();return true}
   if(msg.type==='save'){
    const next=configWithDefaults(msg.config);await chrome.storage.local.set({config:next});
    const tabs=await chrome.tabs.query({url:'https://vgen.co/*'});for(const tab of tabs)chrome.tabs.sendMessage(tab.id,{type:'config-updated',config:next}).catch(()=>{});return true;
   }
   if(msg.type==='key'){await chrome.storage.local.set({apiKeys:{...saved.apiKeys,[msg.provider||cfg.provider]:msg.key}});return true}
   if(msg.type==='native'){
    if(msg.op==='profile')return refreshProfile({username:msg.value.username},fetch,true);
    if(!['diagnostic','diagnostic-start','diagnostic-stop'].includes(msg.op))throw Error('此操作需要从 VGen 页面发起');
    const tabs=await chrome.tabs.query({url:'https://vgen.co/*'});const tab=tabs.find(t=>t.active)||tabs[0];if(!tab)throw Error('请先打开 VGen 页面');
    const result=await chrome.tabs.sendMessage(tab.id,{type:'native-request',op:msg.op});if(!result?.ok)throw Error(result?.error||'页面桥接不可用，请刷新 VGen 页面');return result.value;
   }
   if(msg.type==='ai'){
    if(!cfg.mock){if(!await chrome.permissions.contains({origins:[permissionOrigin(cfg.baseURL)]}))throw Error('请先在扩展设置中授权当前接口域名')}
    return generate(cfg,Object.hasOwn(saved.apiKeys||{},cfg.provider)?saved.apiKeys[cfg.provider]:saved.apiKey||'',msg.payload);
   }
   throw Error('未知请求');
  })().then(value=>reply({ok:true,value}),(error)=>{const allowed=/^(请|API Key|服务商|接口|Base URL|此操作|客户|页面桥接|超过|模型)/;const message=error?.name==='TimeoutError'?'服务商请求超时，请稍后重试':error?.name==='TypeError'?'接口网络连接失败，请检查 Base URL 与域名授权':allowed.test(error?.message)?error.message:'操作失败，请检查配置后重试';reply({ok:false,error:message})});return true;
 });
});
