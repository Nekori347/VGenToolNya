import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
let cdpBase = process.env.VGEN_NYA_CDP || 'http://127.0.0.1:9333';
const serverPort = Number(process.env.VGEN_NYA_FIXTURE_PORT || 9444);

const servedFiles = new Map([
    ['/quick-seeder.user.js', 'tests/fixtures/tampermonkey/VGen-Tag-Quick-Legacy-Seeder.user.js'],
    ['/toolkit-seeder.user.js', 'tests/fixtures/tampermonkey/VGen-Toolkit-Legacy-Seeder.user.js'],
    ['/quick-bridge.user.js', 'migration/bridges/VGen-Tag-Quick-Legacy-Export-Bridge.user.js'],
    ['/toolkit-bridge.user.js', 'migration/bridges/VGen-Toolkit-Legacy-Export-Bridge.user.js'],
    ['/importer.user.js', 'migration/importer/VGenToolNya-Legacy-Importer.user.js'],
    ['/conflict-seeder.user.js', 'tests/fixtures/tampermonkey/VGenToolNya-Conflict-Seeder.user.js'],
    ['/recovery-seeder.user.js', 'tests/fixtures/tampermonkey/VGenToolNya-Recovery-Seeder.user.js'],
]);

class CDPClient {
    constructor(url) {
        this.url = url;
        this.nextId = 1;
        this.pending = new Map();
    }

    async connect() {
        this.socket = new WebSocket(this.url);
        await new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (!message.id) return;
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
        return this;
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    close() {
        this.socket.close();
    }
}

async function targets() {
    return (await fetch(`${cdpBase}/json/list`)).json();
}

async function newPage(url) {
    const response = await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    if (!response.ok) throw new Error(`Unable to create page: ${response.status}`);
    return response.json();
}

async function waitForTarget(predicate, timeoutMs = 10_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const found = (await targets()).find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Timed out waiting for Chrome target');
}

async function evaluate(target, expression) {
    const client = await new CDPClient(target.webSocketDebuggerUrl).connect();
    try {
        await client.send('Runtime.enable');
        const result = await client.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
        return result.result.value;
    } finally {
        client.close();
    }
}

async function waitForExpression(target, expression, timeoutMs = 15_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const value = await evaluate(target, expression);
            if (value) return value;
        } catch { /* page may still be navigating */ }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function closeTarget(target) {
    await fetch(`${cdpBase}/json/close/${target.id}`).catch(() => {});
}

async function installUserScript(route) {
    const before = new Set((await targets()).map((target) => target.id));
    const sourcePage = await newPage(`http://127.0.0.1:${serverPort}${route}`);
    let ask;
    try {
        ask = await waitForTarget((target) => (
            target.type === 'page' && target.url.includes('/ask.html') && !before.has(target.id)
        ), 12_000);
    } catch {
        const client = await new CDPClient(sourcePage.webSocketDebuggerUrl).connect();
        try { await client.send('Page.reload', { ignoreCache: true }); }
        finally { client.close(); }
        ask = await waitForTarget((target) => (
            target.type === 'page' && target.url.includes('/ask.html') && !before.has(target.id)
        ), 12_000);
    }
    await waitForExpression(ask, `document.querySelector('input[type="button"]:not([value="Cancel"])')?.value`);
    const clicked = await evaluate(ask, `(() => {
        const button = document.querySelector('input[type="button"]:not([value="Cancel"])');
        if (!button) return false;
        button.click();
        return true;
    })()`);
    if (!clicked) throw new Error(`Unable to install ${route}`);
    await new Promise((resolve) => setTimeout(resolve, 900));
    await closeTarget(ask);
    await closeTarget(sourcePage);
}

async function openVGenPage(requiredExpression = 'document.body') {
    const page = await newPage('https://vgen.co/');
    await waitForExpression(page, requiredExpression, 20_000);
    return page;
}

async function setFileInput(target, files) {
    const client = await new CDPClient(target.webSocketDebuggerUrl).connect();
    try {
        await client.send('DOM.enable');
        const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
        const { nodeId } = await client.send('DOM.querySelector', {
            nodeId: root.nodeId,
            selector: '#vgen-nya-legacy-files',
        });
        if (!nodeId) throw new Error('Legacy Import file input was not found');
        await client.send('DOM.setFileInputFiles', { nodeId, files });
    } finally {
        client.close();
    }
}

async function newestDownloadedJson(downloadDirectory, previousFiles, timeoutMs = 10_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const names = await readdir(downloadDirectory);
        const candidates = names.filter((name) => name.endsWith('.json') && !previousFiles.has(name));
        if (candidates.length) {
            const withStats = await Promise.all(candidates.map(async (name) => ({
                name,
                info: await stat(path.join(downloadDirectory, name)),
            })));
            withStats.sort((left, right) => right.info.mtimeMs - left.info.mtimeMs);
            return path.join(downloadDirectory, withStats[0].name);
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('Timed out waiting for Bridge JSON download');
}

async function exportBridge(page, buttonId, downloadDirectory) {
    const before = new Set(await readdir(downloadDirectory));
    const clicked = await evaluate(page, `(() => {
        const button = document.getElementById(${JSON.stringify(buttonId)});
        if (!button) return false;
        button.click();
        return true;
    })()`);
    if (clicked === false) throw new Error(`Bridge button was not found: ${buttonId}`);
    try {
        return await newestDownloadedJson(downloadDirectory, before);
    } catch (error) {
        const state = await evaluate(page, `(() => {
            const button = document.getElementById(${JSON.stringify(buttonId)});
            return { text: button?.textContent, status: button?.dataset.exportStatus,
                error: button?.dataset.exportError };
        })()`).catch(() => null);
        throw new Error(`${error.message}; bridge state=${JSON.stringify(state)}`);
    }
}

async function prepareImport(page, files, expectedStatusPattern) {
    await evaluate(page, `document.getElementById('vgen-nya-import-status').textContent = '正在解析…'`);
    await setFileInput(page, files);
    const status = await waitForExpression(page, `(() => {
        const text = document.getElementById('vgen-nya-import-status')?.textContent || '';
        return ${expectedStatusPattern}.test(text) ? text : '';
    })()`);
    const previewText = await evaluate(page, `document.getElementById('vgen-nya-import-preview')?.innerText || ''`);
    return { status, previewText };
}

async function confirmImport(page) {
    await evaluate(page, `document.getElementById('vgen-nya-import-confirm')?.click()`);
    return waitForExpression(page, `(() => {
        const text = document.getElementById('vgen-nya-import-status')?.textContent || '';
        return /^(迁移完成|无需写入)/.test(text) ? text : '';
    })()`);
}

function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

async function assertOldExportUnchanged(beforePath, afterPath) {
    const before = JSON.parse(await readFile(beforePath, 'utf8'));
    const after = JSON.parse(await readFile(afterPath, 'utf8'));
    if (stable(before.payload) !== stable(after.payload)) {
        throw new Error(`Legacy payload changed for ${before.source.id}`);
    }
    return before.source.id;
}

async function enableTampermonkeyUserScripts(extensionId) {
    const page = await newPage(`chrome://extensions/?id=${extensionId}`);
    try {
        await waitForExpression(page, `(() => {
            const find = (root) => {
                for (const element of root.querySelectorAll('*')) {
                    if (element.id === 'allow-user-scripts') return element;
                    if (element.shadowRoot) {
                        const match = find(element.shadowRoot);
                        if (match) return match;
                    }
                }
                return null;
            };
            return Boolean(find(document));
        })()`);
        const result = await evaluate(page, `(() => {
            const find = (root) => {
                for (const element of root.querySelectorAll('*')) {
                    if (element.id === 'allow-user-scripts') return element;
                    if (element.shadowRoot) {
                        const match = find(element.shadowRoot);
                        if (match) return match;
                    }
                }
                return null;
            };
            const row = find(document);
            if (!row) return { found: false, checked: false };
            if (!row.checked) {
                const toggle = row.shadowRoot?.querySelector('cr-toggle');
                (toggle || row).click();
            }
            return { found: true, checked: row.checked };
        })()`);
        if (!result.found) throw new Error('Chrome Allow User Scripts control was not found');
        await waitForExpression(page, `(() => {
            const find = (root) => {
                for (const element of root.querySelectorAll('*')) {
                    if (element.id === 'allow-user-scripts') return element;
                    if (element.shadowRoot) {
                        const match = find(element.shadowRoot);
                        if (match) return match;
                    }
                }
                return null;
            };
            return find(document)?.checked === true;
        })()`);
    } finally {
        await closeTarget(page);
    }
}

async function launchIsolatedProfile({ scenario, port, testRoot, chromePath, extensionPath }) {
    const scenarioRoot = path.join(testRoot, scenario);
    const profile = path.join(scenarioRoot, 'profile');
    const downloads = path.join(scenarioRoot, 'downloads');
    const defaultProfile = path.join(profile, 'Default');
    await mkdir(defaultProfile, { recursive: true });
    await mkdir(downloads, { recursive: true });
    await writeFile(path.join(defaultProfile, 'Preferences'), JSON.stringify({
        download: {
            default_directory: downloads,
            directory_upgrade: true,
            prompt_for_download: false,
        },
        safebrowsing: { enabled: true },
    }), 'utf8');
    const child = spawn(chromePath, [
        `--user-data-dir=${profile}`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--remote-debugging-port=${port}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-sync',
        '--lang=en-US',
        '--window-position=-32000,-32000',
        '--window-size=900,700',
        'about:blank',
    ], { stdio: 'ignore' });
    cdpBase = `http://127.0.0.1:${port}`;
    const startedAt = Date.now();
    let lastError;
    while (Date.now() - startedAt < 15_000) {
        try {
            const version = await (await fetch(`${cdpBase}/json/version`)).json();
            const browser = await new CDPClient(version.webSocketDebuggerUrl).connect();
            await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true });
            browser.close();
            const extensionId = 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
            await waitForTarget((target) => target.type === 'service_worker' && target.url.includes(extensionId));
            await enableTampermonkeyUserScripts(extensionId);
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            return { child, scenarioRoot, downloads };
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    child.kill();
    throw new Error(`Chrome/Tampermonkey did not start for ${scenario}: ${lastError?.message || 'unknown error'}`);
}

async function seedAndInstallBridges() {
    await installUserScript('/quick-seeder.user.js');
    await installUserScript('/toolkit-seeder.user.js');
    const seedPage = await openVGenPage(`document.documentElement.dataset.vgenNyaQuickSeeder === 'complete'
        && document.documentElement.dataset.vgenNyaToolkitSeeder === 'complete'`);
    await closeTarget(seedPage);
    await installUserScript('/quick-bridge.user.js');
    await installUserScript('/toolkit-bridge.user.js');
    return openVGenPage(`document.getElementById('vgen-nya-quick-tag-legacy-export')
        && document.getElementById('vgen-nya-toolkit-legacy-export')`);
}

async function runOrderScenario({ scenario, port, order, testRoot, chromePath, extensionPath, exerciseInvalid = false }) {
    const runtime = await launchIsolatedProfile({ scenario, port, testRoot, chromePath, extensionPath });
    try {
        let page = await seedAndInstallBridges();
        const quickBefore = await exportBridge(page, 'vgen-nya-quick-tag-legacy-export', runtime.downloads);
        const toolkitBefore = await exportBridge(page, 'vgen-nya-toolkit-legacy-export', runtime.downloads);
        await closeTarget(page);
        await installUserScript('/importer.user.js');
        page = await openVGenPage(`document.getElementById('vgen-nya-open-legacy-import')
            && document.getElementById('vgen-nya-quick-tag-legacy-export')
            && document.getElementById('vgen-nya-toolkit-legacy-export')`);
        await evaluate(page, `document.getElementById('vgen-nya-open-legacy-import').click()`);

        const invalidResults = [];
        if (exerciseInvalid) {
            const brokenPath = path.join(runtime.scenarioRoot, 'broken.json');
            const wrongSchemaPath = path.join(runtime.scenarioRoot, 'wrong-schema.json');
            const wrongSourcePath = path.join(runtime.scenarioRoot, 'wrong-source.json');
            const quickObject = JSON.parse(await readFile(quickBefore, 'utf8'));
            await writeFile(brokenPath, '{broken', 'utf8');
            await writeFile(wrongSchemaPath, JSON.stringify({ ...quickObject, schemaVersion: 999 }), 'utf8');
            await writeFile(wrongSourcePath, JSON.stringify({ ...quickObject, source: { ...quickObject.source, id: 'unknown' } }), 'utf8');
            for (const file of [brokenPath, wrongSchemaPath, wrongSourcePath]) {
                invalidResults.push(await prepareImport(page, [file], /拒绝导入/));
            }
        }

        const fileBySource = { quick: quickBefore, toolkit: toolkitBefore };
        const importResults = [];
        for (const source of order) {
            const prepared = await prepareImport(page, [fileBySource[source]], /预览完成/);
            const committed = await confirmImport(page);
            importResults.push({ source, prepared, committed });
        }
        const repeated = await prepareImport(page, [quickBefore, toolkitBefore], /已经迁移过/);
        const repeatedCommit = await confirmImport(page);
        const quickAfter = await exportBridge(page, 'vgen-nya-quick-tag-legacy-export', runtime.downloads);
        const toolkitAfter = await exportBridge(page, 'vgen-nya-toolkit-legacy-export', runtime.downloads);
        const unchanged = [
            await assertOldExportUnchanged(quickBefore, quickAfter),
            await assertOldExportUnchanged(toolkitBefore, toolkitAfter),
        ];
        await closeTarget(page);
        return { scenario, order, invalidResults, importResults, repeated, repeatedCommit, unchanged };
    } finally {
        runtime.child.kill();
    }
}

async function runConflictScenario({ scenario, port, testRoot, chromePath, extensionPath }) {
    const runtime = await launchIsolatedProfile({ scenario, port, testRoot, chromePath, extensionPath });
    try {
        let page = await seedAndInstallBridges();
        const quick = await exportBridge(page, 'vgen-nya-quick-tag-legacy-export', runtime.downloads);
        await closeTarget(page);
        await installUserScript('/conflict-seeder.user.js');
        const seedPage = await openVGenPage(`document.documentElement.dataset.vgenNyaConflictSeeder === 'complete'`);
        await closeTarget(seedPage);
        await installUserScript('/importer.user.js');
        page = await openVGenPage(`document.getElementById('vgen-nya-open-legacy-import')`);
        await evaluate(page, `document.getElementById('vgen-nya-open-legacy-import').click()`);
        const prepared = await prepareImport(page, [quick], /发现冲突/);
        if (!prepared.previewText.includes('vgen-nya.title-presets.v1') || !prepared.previewText.includes('冲突')) {
            throw new Error('Conflict preview did not identify the existing title preset key');
        }
        const committed = await confirmImport(page);
        const repeated = await prepareImport(page, [quick], /发现冲突/);
        await closeTarget(page);
        return { scenario, prepared, committed, repeated };
    } finally {
        runtime.child.kill();
    }
}

async function runRecoveryScenario({ scenario, port, testRoot, chromePath, extensionPath }) {
    const runtime = await launchIsolatedProfile({ scenario, port, testRoot, chromePath, extensionPath });
    try {
        await installUserScript('/recovery-seeder.user.js');
        const seedPage = await openVGenPage(`document.documentElement.dataset.vgenNyaRecoverySeeder === 'complete'`);
        await closeTarget(seedPage);
        await installUserScript('/importer.user.js');
        const page = await openVGenPage(`document.getElementById('vgen-nya-import-status')?.textContent.includes('已恢复上次中断')`);
        const status = await evaluate(page, `document.getElementById('vgen-nya-import-status').textContent`);
        await closeTarget(page);
        return { scenario, status };
    } finally {
        runtime.child.kill();
    }
}

async function runFullDeploymentL2() {
    const testRoot = process.env.VGEN_NYA_TEST_ROOT;
    const chromePath = process.env.VGEN_NYA_CFT_CHROME;
    const extensionPath = process.env.VGEN_NYA_TM_EXTENSION;
    if (!testRoot || !chromePath || !extensionPath) {
        throw new Error('VGEN_NYA_TEST_ROOT, VGEN_NYA_CFT_CHROME and VGEN_NYA_TM_EXTENSION are required');
    }
    const server = await startServer();
    const report = { startedAt: new Date().toISOString(), environment: { chromePath, extensionPath }, scenarios: [] };
    try {
        report.scenarios.push(await runOrderScenario({
            scenario: 'toolkit-then-quick', port: 9341, order: ['toolkit', 'quick'],
            testRoot, chromePath, extensionPath, exerciseInvalid: true,
        }));
        report.scenarios.push(await runOrderScenario({
            scenario: 'quick-then-toolkit', port: 9342, order: ['quick', 'toolkit'],
            testRoot, chromePath, extensionPath,
        }));
        report.scenarios.push(await runConflictScenario({
            scenario: 'conflict-protection', port: 9343, testRoot, chromePath, extensionPath,
        }));
        report.scenarios.push(await runRecoveryScenario({
            scenario: 'interrupted-recovery', port: 9344, testRoot, chromePath, extensionPath,
        }));
        report.completedAt = new Date().toISOString();
        report.pass = true;
        const reportPath = path.join(testRoot, 'deployment-l2-report.json');
        await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
        process.stdout.write(`${JSON.stringify({ pass: true, reportPath, scenarios: report.scenarios }, null, 2)}\n`);
    } finally {
        server.close();
    }
}

function startServer() {
    const server = http.createServer(async (request, response) => {
        const relativePath = servedFiles.get(new URL(request.url, `http://127.0.0.1:${serverPort}`).pathname);
        if (!relativePath) {
            response.writeHead(404).end('not found');
            return;
        }
        const source = await readFile(path.join(projectRoot, relativePath));
        response.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        response.end(source);
    });
    return new Promise((resolve) => server.listen(serverPort, '127.0.0.1', () => resolve(server)));
}

async function probeInstall() {
    const server = await startServer();
    try {
        await newPage(`http://127.0.0.1:${serverPort}/quick-seeder.user.js`);
        const ask = await waitForTarget((target) => target.type === 'page' && target.url.includes('/ask.html'));
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const details = await evaluate(ask, `({
            title: document.title,
            text: document.body?.innerText,
            controls: [...document.querySelectorAll('button,input')].map((node) => ({
                tag: node.tagName, id: node.id, type: node.type, value: node.value, text: node.textContent
            }))
        })`);
        process.stdout.write(`${JSON.stringify({ ask: { id: ask.id, url: ask.url }, details }, null, 2)}\n`);
    } finally {
        server.close();
    }
}

async function probeOptions() {
    const currentTargets = await targets();
    const extensionTarget = currentTargets.find((target) => target.url.startsWith('chrome-extension://'));
    const extensionId = extensionTarget?.url.split('/')[2] || process.env.VGEN_NYA_TM_EXTENSION_ID;
    if (!extensionId) throw new Error('Tampermonkey extension id is unavailable');
    const page = await newPage(`chrome-extension://${extensionId}/options.html#nav=settings`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const details = await evaluate(page, `({
        title: document.title,
        text: document.body?.innerText?.slice(0, 12000),
        controls: [...document.querySelectorAll('button,input,select')].slice(0, 200).map((node) => ({
            tag: node.tagName, id: node.id, name: node.name, type: node.type,
            value: node.value, checked: node.checked, text: node.textContent?.trim()
        }))
    })`);
    process.stdout.write(`${JSON.stringify({ extensionId, details }, null, 2)}\n`);
}

async function probeChromeExtensions() {
    const extensionId = process.env.VGEN_NYA_TM_EXTENSION_ID || 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
    const page = await newPage(`chrome://extensions/?id=${extensionId}`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const details = await evaluate(page, `(() => {
        const rows = [];
        const visit = (root, depth = 0) => {
            for (const element of root.querySelectorAll('*')) {
                if (element.shadowRoot) visit(element.shadowRoot, depth + 1);
                if (/user script|developer mode|allow/i.test(element.textContent || '') || element.tagName === 'CR-TOGGLE') {
                    rows.push({ tag: element.tagName, id: element.id, text: (element.textContent || '').trim().slice(0, 300),
                        checked: element.checked, depth });
                }
            }
        };
        visit(document);
        return { body: document.body.innerText, rows };
    })()`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

if (process.argv.includes('--probe-install')) await probeInstall();
if (process.argv.includes('--probe-options')) await probeOptions();
if (process.argv.includes('--probe-chrome-extensions')) await probeChromeExtensions();
if (process.argv.includes('--run-full')) await runFullDeploymentL2();
