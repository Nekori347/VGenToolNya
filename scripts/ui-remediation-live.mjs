import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9335');const context=browser.contexts()[0];const page=context.pages().find(p=>p.url().startsWith('https://vgen.co'));
const errors=[];
const settle=async()=>{try{await page.waitForLoadState('networkidle',{timeout:9000})}catch{}await page.waitForTimeout(800)};
try{
 if(process.argv.includes('--reload-extension')){const manager=await context.newPage();await manager.goto('chrome://extensions');const toggle=manager.locator('extensions-item').filter({hasText:'VGenToolNya'}).locator('#enableToggle');await toggle.click();await toggle.click();await manager.close();await page.reload({waitUntil:'domcontentloaded'})}
 if(new URL(page.url()).pathname!=='/creator/portfolio')await page.goto('https://vgen.co/creator/portfolio',{waitUntil:'domcontentloaded'});page.on('pageerror',e=>errors.push(e.message));await settle();await page.locator('[data-nya-main]').waitFor({state:'attached'});
 const worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension:'));const options=await context.newPage();await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);const rpc=async(type,data={})=>options.evaluate(m=>chrome.runtime.sendMessage(m),{type,...data});
 const result={errors,modes:[]};const cfg=(await rpc('load')).value;
 for(const language of ['zh','en','bilingual']){cfg.language=language;await rpc('save',{config:cfg});await page.waitForTimeout(700);
  result.modes.push(await page.evaluate(()=>({route:location.pathname,language:document.querySelector('[data-nya-controls]')?.shadowRoot?.querySelector('select')?.value,viewport:[innerWidth,innerHeight],horizontalOverflow:document.documentElement.scrollWidth-innerWidth,secondary:document.querySelectorAll('[data-nya-i18n]').length,clientsHeight:document.querySelector('[data-nya-clients]')?.getBoundingClientRect().height,headings:[...document.querySelectorAll('h1,h2,button')].filter(e=>!e.closest('[data-nya]')).map(e=>e.textContent.trim()).filter(t=>/Portfolio|作品集|Reorder|顺序|Manage tags|管理标签/.test(t))})));
  await page.screenshot({path:`evidence/ui-remediation/after-portfolio-${language}.png`});
 }
 result.reports=(await rpc('locale-reports')).value;await fs.writeFile('evidence/ui-remediation/live-first.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,reports:undefined}));await options.close();
}finally{await page.bringToFront();await browser.close()}
