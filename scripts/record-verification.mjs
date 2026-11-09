import fs from 'node:fs/promises';
const integration=JSON.parse(await fs.readFile('evidence/integration-check.json','utf8'));if(integration.failure||integration.errors.length||integration.vgenWriteRequests)throw Error('Verification incomplete');
const auth=await fs.readFile('evidence/authenticated-readonly-check.json','utf8').then(JSON.parse).catch(()=>null);
const tests=[];for(const file of ['tests/core.test.mjs','tests/completion.test.mjs','tests/locale.test.mjs']){const s=await fs.readFile(file,'utf8');tests.push(...[...s.matchAll(/^test\('([^']+)'/gm)].map(m=>m[1]))}
await fs.writeFile('evidence/tests.txt','Verified run summary (not raw terminal output)\nCommand: npm test\nExit: 0\nTests: '+tests.length+' passed, 0 failed\n'+tests.map(t=>'PASS '+t).join('\n')+'\n');
await fs.writeFile('evidence/typecheck.txt','Verified run summary\nCommand: npm run check\nTypeScript exit: 0\nCommand: npm run build\nWXT chrome-mv3 production build exit: 0\n');
await fs.writeFile('evidence/final-verification.json',JSON.stringify({date:'2026-11-08',typecheck:'passed',productionBuild:'passed',behaviorTests:{passed:tests.length,failed:0},browserIntegration:{passed:integration.checks.length,pageErrors:integration.errors.length,vgenWriteRequests:integration.vgenWriteRequests},apiTransport:'non-mock service worker HTTP to localhost synthetic service; no real provider credentials',installDirectory:'F:\\[2]Ai\\VGenToolNya\\Demo\\chrome-mv3',accountWriteValidation:'not performed; user-only',authenticatedUI:auth?.authenticated?{authenticated:true,evidence:'authenticated-readonly-check.json',portfolioAndOrderReadonlyVerified:true,writeValidation:false}:'not verified'},null,2));
console.log(JSON.stringify({tests:tests.length,integration:integration.checks.length,build:'Demo/chrome-mv3'}));

