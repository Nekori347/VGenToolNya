import http from 'node:http';
import { spawn } from 'node:child_process';
import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
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
    ['/VGenToolNya.user.js', 'dist/VGenToolNya.user.js'],
]);

class CDPClient {
    constructor(url) {
        this.url = url;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }

    async connect() {
        this.socket = new WebSocket(this.url);
        await new Promise((resolve, reject) => {
            this.socket.addEventListener('open', resolve, { once: true });
            this.socket.addEventListener('error', reject, { once: true });
        });
        this.socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (!message.id) {
                for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
                return;
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
        return this;
    }

    on(method, listener) {
        if (!this.listeners.has(method)) this.listeners.set(method, new Set());
        this.listeners.get(method).add(listener);
        return () => this.listeners.get(method)?.delete(listener);
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
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description
                || result.exceptionDetails.exception?.value
                || result.exceptionDetails.text
                || 'Evaluation failed');
        }
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

async function launchIsolatedProfile({
    scenario,
    port,
    testRoot,
    chromePath,
    extensionPath,
    visible = false,
    reusable = false,
}) {
    const scenarioRoot = path.join(testRoot, scenario);
    const profile = path.join(scenarioRoot, 'profile');
    const downloads = path.join(scenarioRoot, 'downloads');
    const defaultProfile = path.join(profile, 'Default');
    await mkdir(defaultProfile, { recursive: true });
    await mkdir(downloads, { recursive: true });
    const preferencesPath = path.join(defaultProfile, 'Preferences');
    let hasPreferences = true;
    try { await access(preferencesPath); } catch { hasPreferences = false; }
    if (!hasPreferences) {
        await writeFile(preferencesPath, JSON.stringify({
            download: {
                default_directory: downloads,
                directory_upgrade: true,
                prompt_for_download: false,
            },
            safebrowsing: { enabled: true },
        }), 'utf8');
    }
    const chromeArguments = [
        `--user-data-dir=${profile}`,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--remote-debugging-port=${port}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-sync',
        '--lang=en-US',
        '--window-size=900,700',
        'about:blank',
    ];
    if (!visible) chromeArguments.splice(-2, 0, '--window-position=-32000,-32000');
    const child = spawn(chromePath, chromeArguments, { stdio: 'ignore', detached: reusable });
    if (reusable) child.unref();
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
            return { child, scenarioRoot, profile, downloads };
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    child.kill();
    throw new Error(`Chrome/Tampermonkey did not start for ${scenario}: ${lastError?.message || 'unknown error'}`);
}

async function bringToFront(target) {
    const client = await new CDPClient(target.webSocketDebuggerUrl).connect();
    try {
        await client.send('Page.bringToFront');
    } finally {
        client.close();
    }
}

async function showUploadLiveWindow() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/'));
    if (!page) throw new Error('The VGen live-test page is not open');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        const { windowId } = await client.send('Browser.getWindowForTarget', { targetId: page.id });
        await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
        await client.send('Browser.setWindowBounds', {
            windowId,
            bounds: { left: 80, top: 80, width: 1200, height: 850 },
        });
        await client.send('Page.bringToFront');
        process.stdout.write(`${JSON.stringify({ shown: true, windowId, page: page.url }, null, 2)}\n`);
    } finally {
        client.close();
    }
}

async function probeUploadLivePage() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator'))
        || (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/'));
    if (!page) throw new Error('The VGen live-test page is not open');
    const details = await evaluate(page, `(() => ({
        url: location.href,
        title: document.title,
        readyState: document.readyState,
        loggedIn: !location.pathname.startsWith('/login'),
        uploadAssistantCount: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
        dialogs: [...document.querySelectorAll('[role="dialog"], .ReactModal__Content')].map((node) => ({
            text: (node.innerText || '').slice(0, 1200),
            ariaModal: node.getAttribute('aria-modal'),
        })),
        buttons: [...document.querySelectorAll('button, a')].map((node) => ({
            tag: node.tagName,
            text: (node.innerText || node.getAttribute('aria-label') || node.title || '').trim().slice(0, 160),
            href: node.href || '',
            ariaLabel: node.getAttribute('aria-label') || '',
        })).filter((item) => item.text || item.href).slice(0, 300),
        bodyText: (document.body?.innerText || '').slice(0, 5000),
    }))()`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function chatLivePage() {
    const targetId = process.env.VGEN_NYA_CHAT_TARGET_ID;
    const targetUrl = process.env.VGEN_NYA_CHAT_TARGET_URL || 'https://vgen.co/';
    const page = (await targets()).find((target) => target.type === 'page' && (targetId ? target.id === targetId : target.url.startsWith(targetUrl)));
    if (!page) throw new Error('The VGen live-test page is not open');
    return page;
}

async function reloadChatLivePage() {
    const page = await chatLivePage();
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try { await client.send('Page.reload', { ignoreCache: true }); }
    finally { client.close(); }
    await waitForExpression(page, `document.readyState === 'complete'`, 20_000);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    process.stdout.write(`${JSON.stringify({ reloaded: true, page: page.url }, null, 2)}\n`);
}

async function openChatLiveOverlay() {
    const page = await chatLivePage();
    const clicked = await evaluate(page, `(() => {
        const trigger = [...document.querySelectorAll('svg.chatIcon, [class*="chatIcon"]')]
            .map((node) => node.closest('button, [role="button"]')).find((node) => {
                const rect = node?.getBoundingClientRect(); const style = node && getComputedStyle(node);
                return rect?.width > 0 && rect?.height > 0 && style?.visibility !== 'hidden' && style?.display !== 'none';
            });
        if (!trigger) return false;
        trigger.click();
        return true;
    })()`);
    if (!clicked) throw new Error('Native VGen Messages trigger was not found');
    await waitForExpression(page, `Boolean(document.querySelector('[class*="ChatLauncher__OuterContainer"], [class*="ExpandedNavOverlay__Overlay"], .str-chat'))`, 8_000);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    process.stdout.write(`${JSON.stringify({ opened: true, page: page.url }, null, 2)}\n`);
}

async function probeChatLive() {
    const page = await chatLivePage();
    const details = await evaluate(page, `(() => {
        const overlay = document.querySelector('.str-chat') || document.querySelector('[class*="ChatLauncher__OuterContainer"], [class*="ExpandedNavOverlay__Overlay"]');
        const previews = overlay ? [...overlay.querySelectorAll('.str-chat__channel-preview, [data-testid*="channel-preview"], [class*="ChatChannelListPreview"]')] : [];
        const messages = overlay ? [...overlay.querySelectorAll('.str-chat__message, .str-chat__message-simple')] : [];
        return {
            url: location.href,
            overlay: Boolean(overlay),
            overlayClass: String(overlay?.className || ''),
            strChatCount: document.querySelectorAll('.str-chat').length,
            previewCount: previews.length,
            previews: previews.slice(0, 30).map((node, index) => ({
                index,
                text: (node.innerText || '').trim().slice(0, 300),
                unread: Boolean(node.querySelector('.str-chat__channel-preview-unread-badge, [class*="UnreadBadge"], [class*="UnreadDot"], [data-testid*="unread"]')),
                className: String(node.className || ''),
            })),
            messageCount: messages.length,
            chatMetaCount: overlay?.querySelectorAll('[data-vgen-nya-ui="chat-meta"]').length || 0,
            readMarkerCount: overlay?.querySelectorAll('[data-vgen-nya-ui="read-marker"]').length || 0,
            compactReactionCount: overlay?.querySelectorAll('[data-vgen-nya-compact-reactions="true"]').length || 0,
            latestButtons: overlay ? [...overlay.querySelectorAll('button[class*="JumpToPresentButton__Anchor"]')].map((node) => ({
                marked: node.dataset.vgenNyaNativeLatest === 'true', text: (node.innerText || node.title || '').trim(),
            })) : [],
            frequentPanels: document.querySelectorAll('[data-vgen-nya-ui="frequent-clients"]').length,
            frequentRows: document.querySelectorAll('[data-vgen-nya-ui="frequent-clients"] [data-client-id]').length,
            fetchName: window.fetch?.name || '',
            overlayText: (overlay?.innerText || '').slice(0, 3000),
            classInventory: overlay ? [...overlay.querySelectorAll('*')].map((node) => String(node.className || ''))
                .filter((value) => /chat|channel|message|reaction|jump/i.test(value)).slice(0, 160) : [],
            roots: [...document.querySelectorAll('[class*="ChatLauncher__OuterContainer"], [class*="ExpandedNavOverlay__Overlay"], .str-chat')].map((node) => ({
                className: String(node.className || ''), connected: node.isConnected, text: (node.innerText || '').trim().slice(0, 240),
                parentClass: String(node.parentElement?.className || ''),
            })),
        };
    })()`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function selectChatLiveConversation() {
    const page = await chatLivePage();
    const index = Number(process.env.VGEN_NYA_CHAT_INDEX || 0);
    const result = await evaluate(page, `(() => {
        const list = document.querySelector('.str-chat__channel-list');
        const cards = list ? [...list.querySelectorAll('[class*="ChatChannelListPreview__PossiblyWithDivider"]')] : [];
        const card = cards[${JSON.stringify(index)}];
        if (!card) return { clicked: false, count: cards.length };
        const unread = Boolean(card.querySelector('.str-chat__channel-preview-unread-badge, [class*="UnreadBadge"], [class*="UnreadDot"], [data-testid*="unread"]'));
        if (unread) return { clicked: false, count: cards.length, blockedUnread: true };
        const target = card.querySelector('[class*="ChatChannelListPreview__Container"]') || card;
        const rect = target.getBoundingClientRect();
        return { clicked: true, count: cards.length, blockedUnread: false, x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 36) };
    })()`);
    if (!result.clicked) throw new Error(result.blockedUnread ? 'Refusing to open an unread conversation' : 'Safe conversation card was not found');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: result.x, y: result.y });
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: result.x, y: result.y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: result.x, y: result.y, button: 'left', clickCount: 1 });
    } finally { client.close(); }
    await waitForExpression(page, `Boolean(document.querySelector('.str-chat__channel'))`, 12_000);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    process.stdout.write(`${JSON.stringify({ selected: true, index, available: result.count }, null, 2)}\n`);
}

async function cycleChatLiveOverlay() {
    const page = await chatLivePage();
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    const cycles = [];
    try {
        await client.send('Input.enable').catch(() => {});
        for (let index = 0; index < 3; index += 1) {
            const close = await evaluate(page, `(() => { const node = document.querySelector('.str-chat__channel button.closeBtn');
                const rect = node?.getBoundingClientRect(); return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; })()`);
            if (!close) throw new Error('Native Chat close button was not found');
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: close.x, y: close.y, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: close.x, y: close.y, button: 'left', clickCount: 1 });
            await waitForExpression(page, `document.querySelectorAll('.str-chat__channel').length === 0`, 5_000);
            await new Promise((resolve) => setTimeout(resolve, 350));
            const closed = await evaluate(page, `({ channels: document.querySelectorAll('.str-chat__channel').length,
                meta: document.querySelectorAll('[data-vgen-nya-ui="chat-meta"]').length,
                marker: document.querySelectorAll('[data-vgen-nya-ui="read-marker"]').length })`);
            const clicked = await evaluate(page, `(() => {
                const icon = [...document.querySelectorAll('svg.chatIcon, [class*="chatIcon"]')].find((node) => node.closest('button, [role="button"]'));
                const trigger = icon?.closest('button, [role="button"]');
                trigger?.click(); return Boolean(trigger);
            })()`);
            if (!clicked) throw new Error('Native Messages trigger disappeared');
            await waitForExpression(page, `document.querySelector('[class*="ChatChannelListPreview__PossiblyWithDivider"]')?.getBoundingClientRect().width > 0`, 8_000);
            const card = await evaluate(page, `(() => { const node = document.querySelector('[class*="ChatChannelListPreview__PossiblyWithDivider"]');
                if (node?.querySelector('.str-chat__channel-preview-unread-badge, [class*="UnreadBadge"], [class*="UnreadDot"], [data-testid*="unread"]')) return null;
                const target = node?.querySelector('[class*="ChatChannelListPreview__Container"]') || node;
                const rect = target?.getBoundingClientRect(); return rect ? { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 36) } : null; })()`);
            if (!card) throw new Error('A safe existing conversation was not found');
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.x, y: card.y, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.x, y: card.y, button: 'left', clickCount: 1 });
            await waitForExpression(page, `document.querySelectorAll('.str-chat__channel').length === 1
                && document.querySelectorAll('[data-vgen-nya-ui="chat-meta"]').length > 0`, 8_000);
            await new Promise((resolve) => setTimeout(resolve, 300));
            const opened = await evaluate(page, `({ channels: document.querySelectorAll('.str-chat__channel').length,
                meta: document.querySelectorAll('[data-vgen-nya-ui="chat-meta"]').length,
                marker: document.querySelectorAll('[data-vgen-nya-ui="read-marker"]').length,
                duplicateGroups: [...document.querySelectorAll('.str-chat__message-bubble-group')]
                    .filter((group) => group.querySelectorAll(':scope > [data-vgen-nya-ui="chat-meta"]').length > 1).length })`);
            cycles.push({ index: index + 1, closed, opened });
        }
    } finally { client.close(); }
    process.stdout.write(`${JSON.stringify({ cycles }, null, 2)}\n`);
}

async function captureChatLive() {
    const page = await chatLivePage();
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Page.bringToFront');
        const { data } = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const output = path.join(projectRoot, 'staging', 'upload-live-test', 'upload-live', 'chat-live.png');
        await writeFile(output, Buffer.from(data, 'base64'));
        process.stdout.write(`${JSON.stringify({ captured: true, output }, null, 2)}\n`);
    } finally { client.close(); }
}

async function inspectChatLiveLayout() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(() => {
        const root = document.querySelector('.str-chat__channel');
        const rect = (node) => { const value = node?.getBoundingClientRect(); return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null; };
        const metas = root ? [...root.querySelectorAll('[data-vgen-nya-ui="chat-meta"]')] : [];
        const reactions = root ? [...root.querySelectorAll('[data-vgen-nya-compact-reactions="true"]')] : [];
        const buttons = root ? [...root.querySelectorAll('button')] : [];
        return {
            metas: metas.slice(-5).map((node) => ({ text: node.innerText, rect: rect(node), display: getComputedStyle(node).display,
                color: getComputedStyle(node).color, parentClass: String(node.parentElement?.className || ''), parentOverflow: getComputedStyle(node.parentElement).overflow })),
            reactions: reactions.slice(-5).map((node) => ({ rect: rect(node), display: getComputedStyle(node).display,
                className: String(node.className || ''), parentClass: String(node.parentElement?.className || '') })),
            buttons: buttons.map((node, index) => ({ index, text: (node.innerText || '').trim(), title: node.title || '', aria: node.getAttribute('aria-label') || '',
                className: String(node.className || ''), rect: rect(node) })).filter((item) => item.rect?.width && item.rect?.height).slice(0, 120),
            duplicateMetaGroups: root ? [...root.querySelectorAll('.str-chat__message-bubble-group')].filter((group) => group.querySelectorAll(':scope > [data-vgen-nya-ui="chat-meta"]').length > 1).length : 0,
        };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function summarizeChatLive() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(() => {
        const channels = [...document.querySelectorAll('.str-chat__channel')];
        const metas = [...document.querySelectorAll('[data-vgen-nya-ui="chat-meta"]')];
        const groups = [...document.querySelectorAll('.str-chat__message-bubble-group')];
        const reactions = [...document.querySelectorAll('[data-vgen-nya-compact-reactions="true"]')];
        const statusBars = [...document.querySelectorAll('[data-vgen-nya-ui="chat-status-bar"]')];
        const readMarkers = [...document.querySelectorAll('[data-vgen-nya-ui="read-marker"]')];
        const latest = [...document.querySelectorAll('button[class*="JumpToPresentButton__Anchor"]')];
        return {
            streamRoots: document.querySelectorAll('.str-chat').length,
            channelRoots: channels.length,
            decoratedChannelRoots: new Set(metas.map((node) => node.closest('.str-chat__channel')).filter(Boolean)).size,
            messages: document.querySelectorAll('.str-chat__message, .str-chat__message-simple').length,
            metas: metas.length,
            duplicateMetaGroups: groups.filter((group) => group.querySelectorAll(':scope > [data-vgen-nya-ui="chat-meta"]').length > 1).length,
            reactions: reactions.length,
            reactionButtonsRemainNative: reactions.every((node) => node.querySelector('button')),
            statusBars: statusBars.length,
            statusBarStates: statusBars.reduce((result, node) => {
                const key = (node.dataset.direction || 'unknown') + ':' + (node.dataset.status || 'unknown');
                result[key] = (result[key] || 0) + 1;
                return result;
            }, {}),
            statusBarsInBubbleFlow: statusBars.every((node) => node.parentElement?.classList.contains('str-chat__message-bubble')
                && getComputedStyle(node).position === 'static'),
            readMarkers: readMarkers.length,
            duplicateStatusBars: [...document.querySelectorAll('.str-chat__message-bubble')]
                .filter((bubble) => bubble.querySelectorAll(':scope > [data-vgen-nya-ui="chat-status-bar"]').length > 1).length,
            latestButtons: latest.length,
            latestMarked: latest.filter((node) => node.dataset.vgenNyaNativeLatest === 'true').length,
            assistantStyles: document.querySelectorAll('style[data-vgen-nya-ui="chat-style"]').length,
            composerEmpty: [...document.querySelectorAll('textarea, [contenteditable="true"]')].filter((node) => node.closest('.str-chat__channel'))
                .every((node) => !(node.value || node.textContent || '').trim()),
            scrollCandidates: [...document.querySelectorAll('.str-chat__message-list-scroll, .str-chat__list, .str-chat__ul, .channelContainer')].map((node) => ({
                className: String(node.className || ''), scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
                overflowY: getComputedStyle(node).overflowY,
            })),
        };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function probeFrequentClientsLive() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(() => ({
        url: location.href,
        panelCount: document.querySelectorAll('[data-vgen-nya-ui="frequent-clients"]').length,
        hosts: [...document.querySelectorAll('aside, nav, [class*="Sidebar"], [class*="sidebar"]')].map((node) => ({
            tag: node.tagName, className: String(node.className || ''), textLength: (node.innerText || '').length,
            rect: (() => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
        })).filter((item) => item.rect.width > 0 && item.rect.height > 0).slice(0, 80),
    }))()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function exerciseChatLiveJump() {
    const page = await chatLivePage();
    const location = await evaluate(page, `(() => {
        const list = document.querySelector('.str-chat__list');
        if (!list) return { found: false };
        const rect = list.getBoundingClientRect();
        return { found: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`);
    if (!location.found) throw new Error('Native Stream message scroller was not found');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: location.x, y: location.y });
        for (let index = 0; index < 4; index += 1) {
            await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: location.x, y: location.y, deltaX: 0, deltaY: -700 });
            await new Promise((resolve) => setTimeout(resolve, 120));
        }
    } finally { client.close(); }
    const before = await evaluate(page, `(() => { const list = document.querySelector('.str-chat__list');
        return { distance: list.scrollHeight - list.scrollTop - list.clientHeight, scrollTop: list.scrollTop }; })()`);
    await waitForExpression(page, `Boolean(document.querySelector('[class*="JumpToPresent"]'))`, 5_000);
    const target = await evaluate(page, `(() => {
        const root = document.querySelector('[class*="JumpToPresent"]');
        const button = root?.matches('button') ? root : root?.closest('button') || root?.querySelector('button');
        const rect = button?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, marked: button.dataset.vgenNyaNativeLatest === 'true' } : null;
    })()`);
    if (!target) throw new Error('Native Jump to present button was not found');
    const clickClient = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await clickClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
        await clickClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    } finally { clickClient.close(); }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const after = await evaluate(page, `(() => { const list = document.querySelector('.str-chat__list');
        return { distance: list.scrollHeight - list.scrollTop - list.clientHeight,
            buttonPresent: Boolean(document.querySelector('[class*="JumpToPresent"]')) }; })()`);
    process.stdout.write(`${JSON.stringify({ before, markedBeforeClick: target.marked, after }, null, 2)}\n`);
}

async function navigateUploadLiveCreator() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/'));
    if (!page) throw new Error('The VGen live-test page is not open');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Page.enable');
        await client.send('Page.navigate', { url: 'https://vgen.co/creator' });
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        await client.send('Page.bringToFront');
    } finally {
        client.close();
    }
    process.stdout.write(`${JSON.stringify({ navigated: true, page: 'https://vgen.co/creator' }, null, 2)}\n`);
}

async function navigateUploadLivePortfolio() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/'));
    if (!page) throw new Error('The VGen live-test page is not open');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Page.enable');
        await client.send('Page.navigate', { url: 'https://vgen.co/creator/portfolio' });
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        await client.send('Page.bringToFront');
    } finally {
        client.close();
    }
    process.stdout.write(`${JSON.stringify({ navigated: true, page: 'https://vgen.co/creator/portfolio' }, null, 2)}\n`);
}

async function navigateUploadLiveServices() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/'));
    if (!page) throw new Error('The VGen live-test page is not open');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Page.enable');
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Page.navigate', { url: 'https://vgen.co/creator/commissions/services' });
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        await client.send('Page.bringToFront');
    } finally { client.close(); }
    const details = await evaluate(page, `({ url: location.href, title: document.title, text: document.body.innerText.slice(0, 3000),
        buttons: [...document.querySelectorAll('button,a')].filter((node) => { const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; })
            .map((node) => ({ tag: node.tagName, text: (node.innerText || node.textContent || '').trim().slice(0, 200), href: node.href || '' })).filter((item) => item.text) })`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function exerciseUploadLiveServiceBlacklist() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/commissions/services'));
    if (!page) throw new Error('The VGen services page is not open');
    const clicked = await evaluate(page, `(() => {
        const button = [...document.querySelectorAll('button')].find((node) => { const rect = node.getBoundingClientRect();
            return node.textContent.trim() === 'Service' && rect.width > 0 && rect.height > 0; });
        button?.click(); return Boolean(button);
    })()`);
    if (!clicked) throw new Error('Safe new-service button is unavailable');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const result = await evaluate(page, `(() => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        return { modal: Boolean(modal), text: (modal?.innerText || '').slice(0, 1800),
            assistantCount: modal?.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length || 0,
            tagInputs: [...(modal?.querySelectorAll('input') || [])].filter((node) => /tag/i.test(node.placeholder || '')).map((node) => node.placeholder) };
    })()`);
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    } finally { client.close(); }
    await new Promise((resolve) => setTimeout(resolve, 500));
    result.afterCloseAssistantCount = await evaluate(page, `document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function measureUploadLiveCleanup() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    let beforeMetrics;
    try {
        await client.send('Performance.enable');
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await waitForExpression(page, `document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length === 0`, 5_000);
        beforeMetrics = await client.send('Performance.getMetrics');
        const mutations = evaluate(page, `(async () => {
            let total = 0; let assistantRelated = 0;
            const observer = new MutationObserver((records) => { total += records.length;
                for (const record of records) for (const node of [...record.addedNodes, ...record.removedNodes]) {
                    if (node.nodeType === 1 && (node.matches?.('[data-vgen-nya-ui="upload-assistant"]') || node.querySelector?.('[data-vgen-nya-ui="upload-assistant"]'))) assistantRelated += 1;
                }
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            await new Promise((resolve) => setTimeout(resolve, 5_000)); observer.disconnect();
            return { total, assistantRelated, assistants: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
                dialogs: document.querySelectorAll('[role="dialog"], .ReactModal__Content').length };
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        const afterMetrics = await client.send('Performance.getMetrics');
        const metric = (set, name) => set.metrics.find((item) => item.name === name)?.value || 0;
        const result = { mutations: await mutations, sampleSeconds: 5,
            taskDurationDeltaMs: Number(((metric(afterMetrics, 'TaskDuration') - metric(beforeMetrics, 'TaskDuration')) * 1000).toFixed(3)),
            scriptDurationDeltaMs: Number(((metric(afterMetrics, 'ScriptDuration') - metric(beforeMetrics, 'ScriptDuration')) * 1000).toFixed(3)),
            jsEventListeners: metric(afterMetrics, 'JSEventListeners'), nodes: metric(afterMetrics, 'Nodes') };
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } finally { client.close(); }
}

async function openUploadLiveModal() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const clicked = await evaluate(page, `(() => {
        const button = [...document.querySelectorAll('button')].filter((node) => {
            const rect = node.getBoundingClientRect();
            return node.textContent.trim() === 'New' && rect.width > 0 && rect.height > 0;
        }).at(-1);
        if (!button) return false;
        button.click();
        return true;
    })()`);
    if (!clicked) throw new Error('Visible Portfolio New button was not found');
    const dialogText = await waitForExpression(page, `(() => {
        const dialog = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        return dialog ? (dialog.innerText || '').slice(0, 1600) : '';
    })()`, 15_000);
    process.stdout.write(`${JSON.stringify({ opened: true, dialogText }, null, 2)}\n`);
}

async function inspectUploadLiveModal() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const details = await evaluate(page, `(() => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        if (!modal) return { found: false };
        const describe = (node) => ({
            tag: node.tagName,
            type: node.type || '',
            value: node.value || '',
            text: (node.innerText || node.textContent || '').trim().slice(0, 240),
            placeholder: node.getAttribute('placeholder') || '',
            ariaLabel: node.getAttribute('aria-label') || '',
            ariaExpanded: node.getAttribute('aria-expanded'),
            contenteditable: node.getAttribute('contenteditable'),
            slate: node.getAttribute('data-slate-editor'),
            className: String(node.className || '').slice(0, 240),
        });
        return {
            found: true,
            inputs: [...modal.querySelectorAll('input, textarea, [contenteditable="true"], [data-slate-editor="true"]')].map(describe),
            buttons: [...modal.querySelectorAll('button, [role="button"]')].map(describe),
            assistant: [...modal.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]')].map(describe),
        };
    })()`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function inspectUploadLiveReactState() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const details = await evaluate(page, `(() => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        if (!modal) return { found: false };
        const own = (element, prefix) => {
            const key = element ? Object.getOwnPropertyNames(element).find((name) => name.startsWith(prefix)) : null;
            return key ? element[key] : null;
        };
        const propsAlong = (element, callback) => {
            let node = element;
            for (let nodeDepth = 0; node && nodeDepth < 7; nodeDepth += 1, node = node.parentElement) {
                let fiber = own(node, '__reactFiber$') || own(node, '__reactInternalInstance$');
                for (let depth = 0; fiber && depth < 80; depth += 1, fiber = fiber.return) {
                    for (const candidate of [fiber, fiber.alternate].filter(Boolean)) {
                        for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                            const result = callback(props, candidate);
                            if (result) return result;
                        }
                    }
                }
            }
            return null;
        };
        const tagInput = [...modal.querySelectorAll('input')].find((node) => /add tags/i.test(node.placeholder || ''));
        const tagBridge = propsAlong(tagInput, (props, fiber) => Array.isArray(props?.initialTags) && typeof props?.onChange === 'function'
            ? { props, fiber } : null);
        let store = null;
        for (let fiber = tagBridge?.fiber, depth = 0; fiber && depth < 120 && !store; depth += 1, fiber = fiber.return) {
            const values = [fiber.memoizedProps, fiber.pendingProps, fiber.memoizedState, fiber.stateNode];
            let dependency = fiber.dependencies?.firstContext;
            for (let index = 0; dependency && index < 20; index += 1, dependency = dependency.next) values.push(dependency.memoizedValue);
            for (const value of values) {
                store = [value, value?.store, value?.value, value?.value?.store, value?.contextValue, value?.contextValue?.store]
                    .find((item) => typeof item?.getState === 'function' && typeof item?.dispatch === 'function') || null;
                if (store) break;
            }
        }
        const state = store?.getState?.();
        const showcase = [state?.showcase, state?.showcaseReducer, ...Object.values(state || {})]
            .find((slice) => typeof slice?.body?.title === 'string' && Array.isArray(slice?.body?.tags));
        const discovery = [];
        let formValues = null;
        for (const input of modal.querySelectorAll('input[type="radio"], input[type="checkbox"]')) {
            propsAlong(input, (props) => {
                if (!formValues && props?.formValues && typeof props?.onFormValueChange === 'function') formValues = structuredClone(props.formValues);
                const option = props?.option;
                if (option?.optionID && Array.isArray(option?.variants) && !discovery.some((item) => item.optionID === option.optionID)) {
                    discovery.push(structuredClone(option));
                }
                return null;
            });
        }
        return {
            found: true,
            titleInput: modal.querySelector('input[placeholder="New Showcase"]')?.value || '',
            tagBridge: tagBridge ? { initialTags: structuredClone(tagBridge.props.initialTags), tagLimit: tagBridge.props.tagLimit } : null,
            showcaseBody: showcase ? { title: showcase.body.title, description: showcase.body.description,
                tags: structuredClone(showcase.body.tags), searchCategoryVariantKeys: structuredClone(showcase.body.searchCategoryVariantKeys) } : null,
            discoverySchema: discovery,
            discoveryFormValues: formValues,
            assistantCount: modal.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
        };
    })()`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function seedUploadLivePresetsThroughSettings() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const result = await evaluate(page, `(async () => {
        const overlay = document.querySelector('#vgen-nya-settings-overlay');
        if (!overlay) return { ok: false, error: 'settings overlay is not open' };
        const schema = [
            { optionID: 'rec2iZNMJUy3VOvam', allowMultipleSelections: false, label: 'Style', variants: [{ variantID: 'recBIGfqTGGviAdex', label: 'Anime / Manga', value: 'recBIGfqTGGviAdex' }] },
            { optionID: 'rec0pgNAc2edoPvYK', allowMultipleSelections: false, label: 'Technique', variants: [{ variantID: 'recdH6XTbwThQz80x', label: 'Illustrated', value: 'recdH6XTbwThQz80x' }] },
            { optionID: 'recjVUmanBktraQqb', allowMultipleSelections: false, label: 'Vibe', variants: [{ variantID: 'recS2LTvkABxBVfzk', label: 'Chill / Cozy', value: 'recS2LTvkABxBVfzk' }] },
        ];
        const discoveryValues = {
            rec2iZNMJUy3VOvam: 'recBIGfqTGGviAdex',
            rec0pgNAc2edoPvYK: 'recdH6XTbwThQz80x',
            recjVUmanBktraQqb: 'recS2LTvkABxBVfzk',
        };
        const slate = '[{"type":"paragraph","children":[{"text":"VGenToolNya live validation. Do not submit."}]}]';
        const domains = [
            ['combination', 'combination', [{ id: 'live-combination', name: 'LIVE Combination - DO NOT SUBMIT',
                title: 'VGenToolNya LIVE TEST - DO NOT SUBMIT', description: slate,
                discoverySchema: schema, discoveryValues, tags: ['vgen tool nya test', 'do not submit'] }]],
            ['text', 'title', [{ id: 'live-title', name: 'LIVE Title - DO NOT SUBMIT', value: 'VGenToolNya LIVE TEST - DO NOT SUBMIT' }]],
            ['text', 'description', [{ id: 'live-description', name: 'LIVE Description - DO NOT SUBMIT', value: slate }]],
            ['discovery', 'discovery', [{ id: 'live-discovery', name: 'LIVE Discovery - DO NOT SUBMIT', schema, values: discoveryValues }]],
            ['search-tags', 'search-tags', [{ id: 'live-tags', name: 'LIVE TEST', tags: [
                { tag: 'vgen tool nya test', note: 'live validation' },
                { tag: 'do not submit', note: 'test only' },
            ] }]],
        ];
        const nav = overlay.querySelector('button[data-action="navigation"][data-id="upload"]');
        nav?.click();
        const saved = [];
        for (const [tabId, sectionId, value] of domains) {
            overlay.querySelector('button[data-action="tab"][data-id="' + tabId + '"]')?.click();
            const sectionKey = 'upload:' + tabId + ':' + sectionId;
            let toggle = overlay.querySelector('button[data-action="section"][data-id="' + sectionKey + '"]');
            if (!toggle) throw new Error('Missing settings section ' + sectionKey);
            if (toggle.getAttribute('aria-expanded') !== 'true') {
                toggle.click();
                toggle = overlay.querySelector('button[data-action="section"][data-id="' + sectionKey + '"]');
            }
            const body = toggle.closest('section')?.querySelector('.vgen-nya-settings__section-body');
            const textarea = body?.querySelector('textarea[data-role="json"]');
            const save = body?.querySelector('button[data-action="save-json"]');
            if (!textarea || !save) throw new Error('Missing JSON editor for ' + sectionKey);
            textarea.value = JSON.stringify(value, null, 2);
            save.click();
            saved.push(sectionKey);
        }
        const close = [...overlay.querySelectorAll('button')].find((node) => node.textContent.trim() === '关闭');
        close?.click();
        const assistant = document.querySelector('[data-vgen-nya-ui="upload-assistant"]');
        return {
            ok: true,
            saved,
            settingsClosed: !document.querySelector('#vgen-nya-settings-overlay'),
            assistantCount: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            selectOptions: [...assistant.querySelectorAll('select[data-kind]')].map((select) => ({ kind: select.dataset.kind, count: select.options.length })),
            quickTags: [...assistant.querySelectorAll('button[data-action="tag"]')].map((button) => button.dataset.tag),
        };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function seedTextPresetLiveThroughSettings() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(async () => {
        const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
        const overlay = document.querySelector('#vgen-nya-settings-overlay');
        if (!overlay) return { ok: false, error: 'settings overlay is not open' };
        const seeded = [];
        const openSection = async (navigation, tab, section) => {
            overlay.querySelector('button[data-action="navigation"][data-id="' + navigation + '"]')?.click();
            await pause();
            overlay.querySelector('button[data-action="tab"][data-id="' + tab + '"]')?.click();
            await pause();
            const key = navigation + ':' + tab + ':' + section;
            let toggle = overlay.querySelector('button[data-action="section"][data-id="' + key + '"]');
            if (!toggle) throw new Error('Missing settings section ' + key);
            if (toggle.getAttribute('aria-expanded') !== 'true') { toggle.click(); await pause(); }
            toggle = overlay.querySelector('button[data-action="section"][data-id="' + key + '"]');
            return toggle.closest('section')?.querySelector('.vgen-nya-settings__section-body');
        };
        const upsert = async (navigation, tab, section, name, payload) => {
            const body = await openSection(navigation, tab, section);
            if (!body) throw new Error('Missing settings body ' + navigation + ':' + tab + ':' + section);
            const row = [...body.querySelectorAll('.vgen-nya-settings__preset-editor')]
                .find((candidate) => candidate.querySelector('[data-role="name"]')?.value === name);
            if (row) {
                row.querySelector('[data-role="content"]').value = payload;
                row.querySelector('button[data-action="save"]').click();
            } else {
                const newName = body.querySelector('[data-role="new-name"]');
                const newContent = body.querySelector('[data-role="new-content"]');
                const add = body.querySelector('button[data-action="add"]');
                if (!newName || !newContent || !add) throw new Error('Text preset editor unavailable in ' + navigation + ':' + tab + ':' + section
                    + ' (' + body.innerHTML.slice(0, 500) + ')');
                newName.value = name;
                newContent.value = payload;
                add.click();
            }
            await pause();
            seeded.push(navigation + ':' + tab + ':' + section);
        };
        const title = 'VGenToolNya PRESET LIVE TEST - DO NOT SUBMIT';
        const slate = '[{"type":"paragraph","children":[{"text":"VGenToolNya preset live validation. Do not submit."}]}]';
        const reply = 'VGenToolNya quick reply live test. DO NOT SEND.';
        await upsert('upload', 'text', 'title', 'PRESET LIVE Title', title);
        await upsert('upload', 'text', 'description', 'PRESET LIVE Description', slate);
        await upsert('chat', 'quick-reply', 'quick-reply', 'PRESET LIVE Reply', reply);
        await upsert('orders', 'text-presets', 'private-note', 'PRESET LIVE Private Note', 'VGenToolNya private note test. DO NOT SAVE.');
        await upsert('orders', 'text-presets', 'final-delivery', 'PRESET LIVE Delivery', 'VGenToolNya delivery test. DO NOT DELIVER.');

        const combinationBody = await openSection('upload', 'combination', 'combination');
        const combination = [{ id: 'preset-live-combination', name: 'PRESET LIVE Combination', title, description: slate,
            discoverySchema: [], discoveryValues: {}, tags: [] }];
        const textarea = combinationBody?.querySelector('textarea[data-role="json"]');
        const save = combinationBody?.querySelector('button[data-action="save-json"]');
        if (!textarea || !save) throw new Error('Missing Combination JSON editor');
        textarea.value = JSON.stringify(combination, null, 2); save.click(); await pause();
        seeded.push('upload:combination:combination');
        [...overlay.querySelectorAll('button')].find((node) => node.textContent.trim() === '关闭')?.click();
        await pause();
        return { ok: true, seeded, settingsClosed: !document.querySelector('#vgen-nya-settings-overlay') };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function exerciseTextPresetUploadLive() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(async () => {
        const pause = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        const root = modal?.querySelector('[data-vgen-nya-ui="upload-assistant"]');
        if (!modal || !root) throw new Error('Upload modal/assistant is unavailable');
        const titleInput = modal.querySelector('input[placeholder="New Showcase"]');
        const findShadowEditor = (node) => {
            if (!node) return null;
            if (node.matches?.('[contenteditable="true"]')) return node;
            for (const child of node.querySelectorAll?.('*') || []) {
                const found = child.shadowRoot && findShadowEditor(child.shadowRoot);
                if (found) return found;
            }
            return null;
        };
        const choose = async (kind, label) => {
            const select = root.querySelector('select[data-kind="' + kind + '"]');
            const option = [...select.options].find((item) => item.textContent === label);
            if (!option) throw new Error('Missing ' + label);
            select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); await pause(650);
        };
        await choose('title', 'PRESET LIVE Title');
        const titleApplied = titleInput?.value;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(titleInput, 'VGenToolNya PRESET MANUAL EDIT - DO NOT SUBMIT');
        titleInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true })); await pause(500);
        const titleManual = titleInput.value;
        await choose('description', 'PRESET LIVE Description');
        const descriptionEditor = findShadowEditor(modal);
        const descriptionText = descriptionEditor?.innerText || descriptionEditor?.textContent || '';
        await choose('combination', 'PRESET LIVE Combination');
        const combination = { title: titleInput.value, descriptionText: (findShadowEditor(modal)?.innerText || '').trim() };
        return {
            assistantCount: modal.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            titleApplied, titleManual, descriptionText: descriptionText.trim(), combination,
            status: root.querySelector('[data-role="status"]')?.textContent || '',
        };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function exerciseTextPresetChatLive() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(async () => {
        const pause = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
        const composerSelector = 'textarea.str-chat__textarea__textarea, textarea.str-chat__message-textarea, .str-chat__message-textarea textarea, textarea[data-testid="message-input"], [class*="MessageInput"] textarea';
        const root = document.querySelector('[data-vgen-nya-ui="quick-replies"]');
        const composer = root?.parentElement?.querySelector(composerSelector) || document.querySelector(composerSelector);
        const findButton = () => [...(root?.querySelectorAll('button[data-preset-id]') || [])].find((node) => node.textContent === 'PRESET LIVE Reply');
        if (!composer || !root || !findButton()) throw new Error('Quick Reply UI/composer is unavailable');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        const setNative = (value) => { setter.call(composer, value); composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })); };
        setNative(''); await pause();
        const messagesBefore = document.querySelectorAll('.str-chat__message, .str-chat__message-simple').length;
        findButton().click(); await pause(650);
        const emptyFill = { value: composer.value, messagesBefore,
            messagesAfter: document.querySelectorAll('.str-chat__message, .str-chat__message-simple').length,
            roots: document.querySelectorAll('[data-vgen-nya-ui="quick-replies"]').length };
        setNative('Manual edit retained - DO NOT SEND'); await pause(500);
        const manualEdit = composer.value;
        const originalConfirm = window.confirm; window.confirm = () => false;
        try { findButton().click(); await pause(500); } finally { window.confirm = originalConfirm; }
        const nonEmptyProtection = composer.value;
        const react = (() => { let node = composer; for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
            const key = Object.getOwnPropertyNames(node).find((name) => name.startsWith('__reactProps$'));
            if (key) return { onChange: typeof node[key]?.onChange, onInput: typeof node[key]?.onInput, depth };
        } return null; })();
        return { emptyFill, manualEdit, nonEmptyProtection,
            composer: { tag: composer.tagName, className: String(composer.className || ''), contenteditable: composer.getAttribute('contenteditable'), parentClass: String(composer.parentElement?.className || ''), react },
            selectedAfterManualEdit: root.querySelector('[aria-pressed="true"]')?.textContent || null };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function exerciseTextPresetChatLifecycle() {
    const page = await chatLivePage();
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        const before = await evaluate(page, `({ channels: document.querySelectorAll('.str-chat__channel').length,
            roots: document.querySelectorAll('[data-vgen-nya-ui="quick-replies"]').length })`);
        await evaluate(page, `(() => { const composer = document.querySelector('.str-chat__channel textarea.str-chat__textarea__textarea, .str-chat__channel textarea.str-chat__message-textarea');
            if (!composer) return false; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            setter?.call(composer, ''); composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null })); return true; })()`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        const firstClose = await evaluate(page, `(() => { const node = document.querySelector('.str-chat__channel button.closeBtn'); const rect = node?.getBoundingClientRect();
            return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; })()`);
        if (!firstClose) throw new Error('Native Chat close button was not found before switch');
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: firstClose.x, y: firstClose.y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: firstClose.x, y: firstClose.y, button: 'left', clickCount: 1 });
        await waitForExpression(page, `document.querySelectorAll('.str-chat__channel').length === 0`, 5_000);
        const trigger = await evaluate(page, `(() => { const node = [...document.querySelectorAll('svg.chatIcon, [class*="chatIcon"]')]
            .map((icon) => icon.closest('button, [role="button"]')).find((button) => { const rect = button?.getBoundingClientRect(); return rect?.width > 0 && rect?.height > 0; });
            const rect = node?.getBoundingClientRect(); return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; })()`);
        if (!trigger) throw new Error('Native Messages trigger was not found during switch');
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: trigger.x, y: trigger.y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: trigger.x, y: trigger.y, button: 'left', clickCount: 1 });
        await waitForExpression(page, `document.querySelector('[class*="ChatChannelListPreview__PossiblyWithDivider"]')?.getBoundingClientRect().width > 0`, 8_000);
        const candidate = await evaluate(page, `(() => {
            const cards = [...document.querySelectorAll('[class*="ChatChannelListPreview__PossiblyWithDivider"]')];
            const safe = cards.filter((card) => { const rect = card.getBoundingClientRect(); return rect.width > 0 && rect.height > 0
                && !card.querySelector('.str-chat__channel-preview-unread-badge, [class*="UnreadBadge"], [class*="UnreadDot"], [data-testid*="unread"]'); });
            const node = safe[1] || safe[0]; const target = node?.querySelector('[class*="ChatChannelListPreview__Container"]') || node;
            const rect = target?.getBoundingClientRect(); return rect ? { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 36), safeCount: safe.length } : null;
        })()`);
        if (!candidate) throw new Error('No safe read conversation is available for switching');
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: candidate.x, y: candidate.y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: candidate.x, y: candidate.y, button: 'left', clickCount: 1 });
        await waitForExpression(page, `document.querySelectorAll('[data-vgen-nya-ui="quick-replies"]').length === 1`, 8_000);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const switched = await evaluate(page, `({ channels: document.querySelectorAll('.str-chat__channel').length,
            roots: document.querySelectorAll('[data-vgen-nya-ui="quick-replies"]').length,
            composers: document.querySelectorAll('textarea.str-chat__textarea__textarea, textarea.str-chat__message-textarea, [class*="MessageInput"] textarea').length })`);
        const close = await evaluate(page, `(() => { const node = document.querySelector('.str-chat__channel button.closeBtn'); const rect = node?.getBoundingClientRect();
            return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; })()`);
        if (!close) throw new Error('Native Chat close button was not found');
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: close.x, y: close.y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: close.x, y: close.y, button: 'left', clickCount: 1 });
        await waitForExpression(page, `document.querySelectorAll('.str-chat__channel').length === 0`, 5_000);
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        const closed = await evaluate(page, `({ channels: document.querySelectorAll('.str-chat__channel').length,
            roots: document.querySelectorAll('[data-vgen-nya-ui="quick-replies"]').length })`);
        process.stdout.write(`${JSON.stringify({ before, safeCount: candidate.safeCount, switched, closed }, null, 2)}\n`);
    } finally { client.close(); }
}

async function inspectTextPresetUiLive() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(() => {
        const nodes = [...document.querySelectorAll('[data-vgen-nya-ui="quick-replies"], [data-vgen-nya-ui="upload-assistant"], #vgen-nya-settings-overlay')];
        return nodes.map((node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return {
            kind: node.dataset.vgenNyaUi || node.id, connected: node.isConnected, visible: rect.width > 0 && rect.height > 0,
            width: Math.round(rect.width), overflowX: style.overflowX, color: style.color, background: style.backgroundColor,
            duplicateCount: node.id ? document.querySelectorAll('#' + node.id).length : document.querySelectorAll('[data-vgen-nya-ui="' + node.dataset.vgenNyaUi + '"]').length,
        }; });
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function inspectTextPresetSettingsUiLive() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(async () => {
        const pause = () => new Promise((resolve) => setTimeout(resolve, 100));
        const overlay = document.querySelector('#vgen-nya-settings-overlay');
        if (!overlay) throw new Error('Settings overlay is unavailable');
        const cases = [
            ['upload', 'text', 'title'], ['upload', 'text', 'description'], ['chat', 'quick-reply', 'quick-reply'],
            ['orders', 'text-presets', 'private-note'], ['orders', 'text-presets', 'final-delivery'],
        ];
        const states = [];
        for (const [navigation, tab, section] of cases) {
            overlay.querySelector('button[data-action="navigation"][data-id="' + navigation + '"]')?.click(); await pause();
            overlay.querySelector('button[data-action="tab"][data-id="' + tab + '"]')?.click(); await pause();
            const key = navigation + ':' + tab + ':' + section;
            let toggle = overlay.querySelector('button[data-action="section"][data-id="' + key + '"]');
            if (toggle?.getAttribute('aria-expanded') !== 'true') { toggle?.click(); await pause(); }
            toggle = overlay.querySelector('button[data-action="section"][data-id="' + key + '"]');
            const body = toggle?.closest('section')?.querySelector('.vgen-nya-settings__section-body');
            const rect = body?.getBoundingClientRect();
            const actionButton = body?.querySelector('.vgen-nya-settings__preset-editor button, .vgen-nya-settings__preset-add button');
            states.push({ key, visible: Boolean(rect?.width && rect?.height), rows: body?.querySelectorAll('.vgen-nya-settings__preset-editor').length || 0,
                addControls: body?.querySelectorAll('.vgen-nya-settings__preset-add input, .vgen-nya-settings__preset-add textarea, .vgen-nya-settings__preset-add button').length || 0,
                overflows: Boolean(body && body.scrollWidth > body.clientWidth + 2), width: Math.round(rect?.width || 0),
                toggleColor: toggle ? getComputedStyle(toggle).color : '', actionColor: actionButton ? getComputedStyle(actionButton).color : '',
                actionBackground: actionButton ? getComputedStyle(actionButton).backgroundColor : '' });
        }
        const inactiveNav = overlay.querySelector('button[data-action="navigation"]:not([aria-current="page"])');
        return { overlays: document.querySelectorAll('#vgen-nya-settings-overlay').length,
            inactiveNavColor: inactiveNav ? getComputedStyle(inactiveNav).color : '', states };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function probeVGenTargetsSafe() {
    const pages = (await targets()).filter((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/'));
    const results = [];
    for (const page of pages) {
        const state = await evaluate(page, `({ ready: document.readyState, fetchName: window.fetch?.name || '',
            settings: document.querySelectorAll('#vgen-nya-settings-overlay').length,
            frequent: document.querySelectorAll('[data-vgen-nya-ui="frequent-clients"]').length,
            assistant: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            chat: document.querySelectorAll('.str-chat').length })`).catch((error) => ({ error: error.message }));
        results.push({ id: page.id, url: page.url, state });
    }
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

async function orderLivePage() {
    const targetId = process.env.VGEN_NYA_ORDER_TARGET_ID;
    const pages = (await targets()).filter((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/commissions'));
    const page = targetId ? pages.find((target) => target.id === targetId) : pages[0];
    if (!page) throw new Error('The isolated Commission test page is unavailable');
    return page;
}

async function createOrderLivePage() {
    const page = await newPage(`https://vgen.co/creator/commissions?nya-order-live=${Date.now()}`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    process.stdout.write(`${JSON.stringify({ targetId: page.id, url: 'https://vgen.co/creator/commissions?nya-order-live=SAFE' }, null, 2)}\n`);
}

const orderCardProbeExpression = `(() => {
    const visible = (node) => { const rect = node?.getBoundingClientRect(); const style = node && getComputedStyle(node);
        return Boolean(rect?.width && rect?.height && style?.display !== 'none' && style?.visibility !== 'hidden'); };
    const selector = 'a[href*="commission"], [class*="CommissionCard"], [class*="commissionCard"]';
    const heading = [...document.querySelectorAll('h1,h2,h3,h4,div,span')]
        .find((node) => /^NEW$/i.test((node.textContent || '').trim()) && visible(node));
    let scope = heading;
    let candidates = [];
    for (let depth = 0; scope && depth < 8; depth += 1, scope = scope.parentElement) {
        const found = [...scope.querySelectorAll(selector)].filter(visible);
        if (found.length) { candidates = found; break; }
    }
    const candidate = candidates[0];
    const target = candidate?.closest?.('a,button,[role="button"]') || candidate;
    const rect = target?.getBoundingClientRect();
    return {
        url: location.pathname + location.search,
        orderStyleCount: document.querySelectorAll('[data-vgen-nya-ui="order-assistant-style"]').length,
        orderRootCount: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length,
        privateNotePresetCount: document.querySelectorAll('[data-vgen-nya-ui="private-note-presets"]').length,
        newHeadingFound: Boolean(heading), candidateCount: candidates.length,
        candidate: rect ? { tag: target.tagName, className: String(target.className || '').slice(0, 240),
            x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 70) } : null,
    };
})()`;

async function probeOrderLiveNeutral() {
    const page = await orderLivePage();
    const result = await evaluate(page, orderCardProbeExpression);
    process.stdout.write(`${JSON.stringify({ targetId: page.id, ...result }, null, 2)}\n`);
}

async function openOrderLiveSafeDetail() {
    const page = await orderLivePage();
    const candidate = await evaluate(page, orderCardProbeExpression);
    if (!candidate.newHeadingFound || !candidate.candidate) throw new Error('The authorized NEW commission card was not found');
    const alreadyOpen = await evaluate(page, `document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length === 1`);
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    const requests = [];
    const responses = new Map();
    try {
        client.on('Network.requestWillBeSent', ({ requestId, request, initiator }) => {
            try {
                const url = new URL(request.url);
                if (url.hostname === 'vgen.co' || url.hostname === 'api.vgen.co') {
                    requests.push({ requestId, method: request.method, url: request.url, initiator: initiator?.type || '' });
                }
            } catch { /* Ignore non-URL requests. */ }
        });
        client.on('Network.responseReceived', ({ requestId, response }) => responses.set(requestId, {
            status: response.status, mimeType: response.mimeType, fromDiskCache: Boolean(response.fromDiskCache),
        }));
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        await client.send('Browser.grantPermissions', { origin: 'https://vgen.co', permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] }).catch(() => {});
        if (!alreadyOpen) {
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: candidate.candidate.x, y: candidate.candidate.y, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: candidate.candidate.x, y: candidate.candidate.y, button: 'left', clickCount: 1 });
            await new Promise((resolve) => setTimeout(resolve, 3_000));
        }
        const details = await evaluate(page, `(async () => {
            const initialRoot = document.querySelector('[data-vgen-nya-ui="order-assistant"]');
            const rect = (node) => { const value = node?.getBoundingClientRect(); return value ? { x: value.x, y: value.y, width: value.width, height: value.height,
                right: value.right, bottom: value.bottom } : null; };
            const visible = (node) => { const value = rect(node); return Boolean(value?.width && value?.height); };
            const panel = initialRoot?.closest('[class*="CommissionModal__Container"], [role="dialog"]');
            const links = [...(panel || document).querySelectorAll('a[href]')].filter((node) => /^@[A-Za-z0-9_-]+$/.test((node.textContent || '').trim()))
                .map((node) => { try { const url = new URL(node.href); return { node, url, handle: (node.textContent || '').trim() }; } catch { return null; } })
                .filter((item) => item?.url.origin === 'https://vgen.co' && item.url.pathname.split('/').filter(Boolean).length === 1);
            const identity = links[0];
            const expectedUrl = identity ? 'https://vgen.co/' + encodeURIComponent(identity.handle.slice(1)) : '';
            const buttons = initialRoot ? [...initialRoot.querySelectorAll('button')] : [];
            const copyId = buttons.find((node) => node.dataset.action === 'copy-id');
            const copyUrl = buttons.find((node) => node.dataset.action === 'copy-url');
            let copyIdMatches = false; let copyUrlMatches = false; let clipboardReadable = false;
            try {
                copyId?.click(); await new Promise((resolve) => setTimeout(resolve, 120));
                const copiedId = await navigator.clipboard.readText(); clipboardReadable = true; copyIdMatches = copiedId === identity?.handle;
                copyUrl?.click(); await new Promise((resolve) => setTimeout(resolve, 120));
                copyUrlMatches = (await navigator.clipboard.readText()) === expectedUrl;
            } catch { /* Browser clipboard read permission may be unavailable. */ }
            const root = document.querySelector('[data-vgen-nya-ui="order-assistant"]');
            const currentButtons = root ? [...root.querySelectorAll('button')] : [];
            const warning = currentButtons.find((node) => node.dataset.action === 'toggle-reviews' && /<5★/.test(node.textContent || ''));
            const neutralReviews = currentButtons.find((node) => node.dataset.action === 'toggle-reviews' && !/<5★/.test(node.textContent || ''));
            const statusText = root?.querySelector('.vgen-nya-order-assistant__status')?.textContent || '';
            const criticalButtons = [...document.querySelectorAll('button')].filter((node) => /^(Accept|Decline)$/i.test((node.textContent || '').trim()) && visible(node));
            const overlaps = (a, b) => a && b && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
            return {
                assistantCount: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length,
                styleCount: document.querySelectorAll('[data-vgen-nya-ui="order-assistant-style"]').length,
                identityResolved: Boolean(identity), publicIdFormat: Boolean(identity && /^@[A-Za-z0-9_-]+$/.test(identity.handle)),
                canonicalProfile: Boolean(identity && (identity.url.href.split(/[?#]/)[0].endsWith('/')
                    ? identity.url.href.split(/[?#]/)[0].slice(0, -1) : identity.url.href.split(/[?#]/)[0]) === expectedUrl),
                expectedProfilePath: identity ? '/' + encodeURIComponent(identity.handle.slice(1)) : '',
                copyButtons: { id: Boolean(copyId), url: Boolean(copyUrl), clipboardReadable, copyIdMatches, copyUrlMatches },
                background: { warningCount: warning ? 1 : 0, neutralReviewTrigger: Boolean(neutralReviews),
                    status: /加载失败/.test(statusText) ? 'ERROR' : /不可用/.test(statusText) ? 'UNAVAILABLE' : /暂无/.test(statusText) ? 'EMPTY' : statusText ? 'LOADING' : 'LOADED' },
                popoverCount: root?.querySelectorAll('.vgen-nya-order-assistant__popover').length || 0,
                reviewBodyCount: root?.querySelectorAll('.vgen-nya-order-assistant__review-body').length || 0,
                privateNotePresetCount: document.querySelectorAll('[data-vgen-nya-ui="private-note-presets"]').length,
                finalDeliveryRoots: document.querySelectorAll('[data-vgen-nya-ui*="delivery"]').length,
                layout: { root: rect(root), criticalButtonCount: criticalButtons.length,
                    overlapsCritical: criticalButtons.some((node) => overlaps(rect(root), rect(node))),
                    horizontalOverflow: Boolean(root && root.scrollWidth > root.clientWidth + 2) },
            };
        })()`);
        const profilePath = details.expectedProfilePath;
        const profileRequests = requests.filter((request) => {
            try { const url = new URL(request.url); return url.origin === 'https://vgen.co' && url.pathname === profilePath; } catch { return false; }
        });
        const profileSchemas = [];
        for (const request of profileRequests.filter((value) => value.method === 'GET')) {
            try {
                const { body } = await client.send('Network.getResponseBody', { requestId: request.requestId });
                const script = body.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
                const value = script ? JSON.parse(script) : null;
                const matches = [];
                const seen = new Set();
                const walk = (node, path = '$', depth = 0) => {
                    if (!node || typeof node !== 'object' || depth > 18 || seen.has(node)) return;
                    seen.add(node);
                    for (const [key, child] of Object.entries(node)) {
                        const nextPath = `${path}.${key}`;
                        if (/review|rating|feedback/i.test(key)) matches.push({ path: nextPath, type: Array.isArray(child) ? 'array' : typeof child,
                            length: Array.isArray(child) ? child.length : undefined });
                        walk(child, nextPath, depth + 1);
                    }
                };
                walk(value);
                const clientReviewStats = value?.props?.pageProps?.user?.clientReviewStats;
                profileSchemas.push({ ...responses.get(request.requestId), hasNextData: Boolean(value),
                    nextDataKeys: value && typeof value === 'object' ? Object.keys(value).slice(0, 20) : [],
                    clientReviewStats: clientReviewStats && typeof clientReviewStats === 'object'
                        ? Object.fromEntries(Object.entries(clientReviewStats).filter(([, item]) => typeof item === 'number' || typeof item === 'boolean')) : null,
                    matches: matches.slice(0, 80) });
            } catch (error) {
                profileSchemas.push({ ...responses.get(request.requestId), bodyInspection: 'UNAVAILABLE', error: String(error?.message || error) });
            }
        }
        delete details.expectedProfilePath;
        process.stdout.write(`${JSON.stringify({
            targetId: page.id,
            candidate: { newHeadingFound: candidate.newHeadingFound, candidateCount: candidate.candidateCount },
            details,
            network: {
                profileRequests: profileRequests.map((request) => ({ method: request.method, endpoint: '/SAFE_ORDER_CLIENT-01', initiator: request.initiator })),
                profileSchemas,
                toolInitiatedWrites: profileRequests.filter((request) => !['GET', 'HEAD'].includes(request.method)).length,
            },
        }, null, 2)}\n`);
    } finally {
        client.close();
    }
}

async function inspectOrderLiveDom() {
    const page = await orderLivePage();
    const result = await evaluate(page, `(() => {
        const describe = (node) => node ? { tag: node.tagName, className: String(node.className || '').slice(0, 260),
            id: node.id || '', role: node.getAttribute?.('role') || '', ariaModal: node.getAttribute?.('aria-modal') || '',
            bodyChild: node.parentElement === document.body } : null;
        const chain = (node) => { const values = []; for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) values.push(describe(node)); return values; };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let commissionNode = null;
        while (walker.nextNode()) { if (/COMM#\s*[A-Z0-9]{8,16}/i.test(walker.currentNode.nodeValue || '')) { commissionNode = walker.currentNode.parentElement; break; } }
        const profileLinks = [...document.querySelectorAll('a[href]')].filter((node) => {
            try { const url = new URL(node.href); return url.origin === 'https://vgen.co' && url.pathname.split('/').filter(Boolean).length === 1
                && /^@[A-Za-z0-9_-]+$/.test((node.textContent || '').trim()); } catch { return false; }
        });
        const handleNode = [...document.querySelectorAll('a,button,div,span,p')]
            .find((node) => /^@[A-Za-z0-9_-]+$/.test((node.textContent || '').trim()) && node.children.length === 0);
        const populatedPortals = [...document.body.children].filter((node) => node.matches?.('.ReactModalPortal') && node.childElementCount > 0);
        return {
            commissionMarkerFound: Boolean(commissionNode), commissionChain: chain(commissionNode),
            publicProfileLinkCount: profileLinks.length, profileChain: chain(profileLinks.at(-1)),
            handleNodeFound: Boolean(handleNode), handleNodeChain: chain(handleNode),
            populatedPortalCount: populatedPortals.length, populatedPortalChains: populatedPortals.map((node) => chain(node.firstElementChild)).slice(0, 8),
            bodyChildren: [...document.body.children].map(describe),
            dialogs: [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], aside')].map(describe).slice(0, 20),
            orderRoots: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length,
        };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function inspectOrderPublicReviewsSafe() {
    const orderPage = await orderLivePage();
    const profileUrl = await evaluate(orderPage, `(() => {
        const modal = document.querySelector('[class*="CommissionModal__Container"]');
        const link = [...(modal?.querySelectorAll('a[href]') || [])].find((node) => {
            try { const url = new URL(node.href); return url.origin === 'https://vgen.co' && url.pathname.split('/').filter(Boolean).length === 1
                && /^@[A-Za-z0-9_-]+$/.test((node.textContent || '').trim()); } catch { return false; }
        });
        return link?.href || '';
    })()`);
    if (!profileUrl) throw new Error('The authorized order public profile URL is unavailable');
    const page = await newPage('about:blank');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    const requests = [];
    try {
        client.on('Network.requestWillBeSent', ({ request, initiator }) => {
            try {
                const url = new URL(request.url);
                if (url.hostname === 'vgen.co' || url.hostname === 'api.vgen.co') requests.push({ method: request.method, url, initiator: initiator?.type || '' });
            } catch { /* Ignore non-URL requests. */ }
        });
        await client.send('Network.enable');
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Page.navigate', { url: profileUrl });
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        let chip = null;
        for (let step = 0; step < 8 && !chip; step += 1) {
            chip = await evaluate(page, `(() => {
                const nodes = [...document.querySelectorAll('button, [role="button"], [class*="chipButton"]')];
                const node = nodes.find((value) => /\breviews?\b/i.test(value.textContent || ''));
                if (node) node.scrollIntoView({ block: 'center' }); else window.scrollBy(0, Math.max(480, innerHeight * .8));
                const rect = node?.getBoundingClientRect();
                return rect && rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
            })()`);
            if (!chip) await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const requestBoundary = requests.length;
        if (chip) {
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: chip.x, y: chip.y, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: chip.x, y: chip.y, button: 'left', clickCount: 1 });
            await new Promise((resolve) => setTimeout(resolve, 2_500));
        }
        const dom = await evaluate(page, `(() => {
            const nodes = [...document.querySelectorAll('[class*="review" i], [data-testid*="review" i]')];
            const ratings = [...document.querySelectorAll('[aria-label*="star" i], [class*="rating" i]')];
            return { reviewChipFound: ${Boolean(chip)}, reviewLikeNodes: nodes.length, ratingLikeNodes: ratings.length,
                selectableTextNodes: nodes.filter((node) => getComputedStyle(node).userSelect !== 'none' && (node.textContent || '').trim()).length };
        })()`);
        const sanitize = (url) => ({ host: url.host, endpoint: url.pathname.replace(new URL(profileUrl).pathname, '/SAFE_ORDER_CLIENT-01'), queryKeys: [...url.searchParams.keys()].sort() });
        process.stdout.write(`${JSON.stringify({ targetId: page.id, dom,
            requestsAfterChip: requests.slice(requestBoundary).map((request) => ({ method: request.method, ...sanitize(request.url), initiator: request.initiator })),
        }, null, 2)}\n`);
    } finally { client.close(); }
}

async function inspectOrderNativeClientReviewsSafe() {
    const page = await orderLivePage();
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    const requests = [];
    const responses = new Map();
    try {
        client.on('Network.requestWillBeSent', ({ requestId, request, initiator }) => {
            try {
                const url = new URL(request.url);
                if (url.hostname === 'vgen.co' || url.hostname === 'api.vgen.co') requests.push({ requestId, method: request.method, url, initiator: initiator?.type || '' });
            } catch { /* Ignore non-URL requests. */ }
        });
        client.on('Network.responseReceived', ({ requestId, response }) => responses.set(requestId, { status: response.status, mimeType: response.mimeType }));
        await client.send('Network.enable');
        await client.send('Runtime.enable');
        const trigger = await evaluate(page, `(() => {
            const modal = document.querySelector('[class*="CommissionModal__Container"]');
            const profile = [...(modal?.querySelectorAll('a[href]') || [])].find((node) => /^@[A-Za-z0-9_-]+$/.test((node.textContent || '').trim()));
            let scope = profile;
            let trigger = modal?.querySelector('[class*="ClientReviewsPreview__ArrowButton"]') || null;
            for (let depth = 0; scope && depth < 9; depth += 1, scope = scope.parentElement) {
                if (trigger) break;
                trigger = [...scope.querySelectorAll('button, a, [role="button"]')].find((node) => /^see all$/i.test((node.textContent || '').trim()));
                if (trigger) break;
            }
            if (!trigger) trigger = modal?.querySelector('[class*="ClientReviewsPreview__Container"]') || null;
            trigger?.scrollIntoView({ block: 'center' });
            const rect = trigger?.getBoundingClientRect();
            return rect && rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
        })()`);
        if (trigger) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: trigger.x, y: trigger.y, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: trigger.x, y: trigger.y, button: 'left', clickCount: 1 });
            await new Promise((resolve) => setTimeout(resolve, 2_500));
        }
        const dom = await evaluate(page, `(() => { const reviewNodes = [...document.querySelectorAll('[class*="review" i], [data-testid*="review" i]')]; return {
            reviewLikeNodes: reviewNodes.length,
            reviewNodeShapes: reviewNodes.map((node) => ({ tag: node.tagName, className: String(node.className || '').slice(0, 180),
                textLength: (node.textContent || '').trim().length, hasReviewWord: /reviews?/i.test(node.textContent || ''),
                numericTokens: ((node.textContent || '').match(/[0-9]+(?:\.[0-9]+)?%?/g) || []).slice(0, 8),
                clickableAncestor: node.closest('button, a, [role="button"]')?.tagName || '' })).slice(0, 30),
            dialogs: document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length,
            orderRoots: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length,
        }; })()`);
        const responseSchemas = [];
        for (const request of requests.filter((value) => value.method === 'GET')) {
            try {
                const result = await client.send('Network.getResponseBody', { requestId: request.requestId });
                const contentType = responses.get(request.requestId)?.mimeType || '';
                if (!/json/i.test(contentType) && !/^\s*[\[{]/.test(result.body || '')) continue;
                const value = JSON.parse(result.body);
                const items = Array.isArray(value) ? value : [];
                const itemKeys = [...new Set(items.flatMap((item) => item && typeof item === 'object' ? Object.keys(item) : []))].sort();
                const booleanFields = Object.fromEntries(itemKeys.map((key) => [key, items.map((item) => item?.[key]).filter((item) => typeof item === 'boolean')])
                    .filter(([, values]) => values.length).map(([key, values]) => [key, { true: values.filter(Boolean).length, false: values.filter((item) => !item).length }]));
                const pathParts = request.url.pathname.split('/').filter(Boolean);
                const endpointIds = { first: pathParts[0], last: pathParts.at(-1) };
                const idRelations = Object.fromEntries(Object.entries(endpointIds).map(([label, id]) => [label,
                    itemKeys.filter((key) => items.some((item) => item?.[key] === id))]));
                const matches = [];
                const seen = new Set();
                const walk = (node, path = '$', depth = 0) => {
                    if (!node || typeof node !== 'object' || depth > 15 || seen.has(node)) return;
                    seen.add(node);
                    for (const [key, child] of Object.entries(node)) {
                        const nextPath = `${path}.${key}`;
                        if (/review|rating|feedback|comment|content/i.test(key)) matches.push({ path: nextPath,
                            type: Array.isArray(child) ? 'array' : typeof child, length: Array.isArray(child) ? child.length : undefined });
                        walk(child, nextPath, depth + 1);
                    }
                };
                walk(value);
                if (matches.length) responseSchemas.push({ requestId: request.requestId, ...responses.get(request.requestId),
                    rootType: Array.isArray(value) ? 'array' : typeof value, itemCount: items.length, itemKeys, booleanFields,
                    idRelations,
                    matches: matches.slice(0, 100) });
            } catch { /* Ignore unrelated or expired response bodies. */ }
        }
        const reviewRequest = requests.find((request) => request.method === 'GET' && /\/reviews\/client\//.test(request.url.pathname));
        let idPathMatches = null;
        if (reviewRequest) {
            const parts = reviewRequest.url.pathname.split('/').filter(Boolean);
            const firstId = parts[0];
            const lastId = parts.at(-1);
            idPathMatches = await evaluate(page, `(() => {
                let value = null; try { value = JSON.parse(document.querySelector('#__NEXT_DATA__')?.textContent || 'null'); } catch {}
                const found = { first: [], last: [] }; const seen = new Set();
                const walk = (node, path = '$', depth = 0) => { if (!node || typeof node !== 'object' || depth > 18 || seen.has(node)) return; seen.add(node);
                    for (const [key, child] of Object.entries(node)) { const nextPath = path + '.' + key;
                        if (child === ${JSON.stringify(firstId)}) found.first.push(nextPath);
                        if (child === ${JSON.stringify(lastId)}) found.last.push(nextPath);
                        walk(child, nextPath, depth + 1); } };
                walk(value); return found;
            })()`);
        }
        const sanitize = (url) => { const parts = url.pathname.split('/').filter(Boolean); const opaque = parts.filter((part) => /^[A-Za-z0-9_-]{12,}$/.test(part)); return {
            host: url.host, endpoint: url.pathname.replace(/\/[A-Za-z0-9_-]{12,}(?=\/|$)/g, '/SAFE_ID'), idsEqual: opaque.length > 1 ? opaque[0] === opaque.at(-1) : null,
            queryKeys: [...url.searchParams.keys()].sort(),
        }; };
        process.stdout.write(`${JSON.stringify({ triggerFound: Boolean(trigger), dom, idPathMatches,
            requests: requests.map((request) => ({ method: request.method, ...sanitize(request.url), initiator: request.initiator })), responseSchemas,
        }, null, 2)}\n`);
    } finally { client.close(); }
}

async function inspectOrderReviewIdSourcesSafe() {
    const page = await orderLivePage();
    const result = await evaluate(page, `(() => {
        const entries = performance.getEntriesByType('resource').map((entry) => entry.name);
        const reviewUrl = entries.find((value) => { try { return new URL(value).pathname.includes('/reviews/client/'); } catch { return false; } });
        if (!reviewUrl) return { reviewRequestFound: false, matches: {} };
        const ids = new URL(reviewUrl).pathname.split('/').filter(Boolean).filter((part) => /^[A-Za-z0-9_-]{12,}$/.test(part));
        const sanitize = (value) => { const url = new URL(value); return url.host + url.pathname.split('/').map((part) => /^[A-Za-z0-9_-]{12,}$/.test(part) ? 'SAFE_ID' : part).join('/'); };
        return { reviewRequestFound: true, matches: Object.fromEntries(ids.map((id, index) => [index === 0 ? 'first' : 'last',
            [...new Set(entries.filter((value) => value !== reviewUrl && value.includes(id)).map(sanitize))].slice(0, 30)])), endpointIds: ids };
    })()`);
    if (result.endpointIds?.length > 1) {
        const relationship = await evaluate(page, `(async () => {
            const links = [...document.querySelectorAll('a[href]')];
            const ownerLink = links.find((node) => /go to my profile/i.test((node.textContent || '').trim()));
            const modal = document.querySelector('[class*="CommissionModal__Container"]');
            const clientLink = [...(modal?.querySelectorAll('a[href]') || [])].find((node) => /^@[A-Za-z0-9_-]+$/.test((node.textContent || '').trim()));
            const findPaths = async (link, expected) => {
                if (!link) return [];
                const response = await fetch(link.href, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'text/html' } });
                const html = await response.text(); const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\\s\\S]*?)<\\/script>/i);
                const value = match ? JSON.parse(match[1]) : null; const paths = []; const seen = new Set();
                const walk = (node, path = '$', depth = 0) => { if (!node || typeof node !== 'object' || depth > 18 || seen.has(node)) return; seen.add(node);
                    for (const [key, child] of Object.entries(node)) { const nextPath = path + '.' + key; if (child === expected) paths.push(nextPath); walk(child, nextPath, depth + 1); } };
                walk(value); return paths;
            };
            try {
                return { ownerProfileLinkFound: Boolean(ownerLink), clientProfileLinkFound: Boolean(clientLink),
                    firstPathsInOwnerProfile: await findPaths(ownerLink, ${JSON.stringify(result.endpointIds[0])}),
                    lastPathsInClientProfile: await findPaths(clientLink, ${JSON.stringify(result.endpointIds.at(-1))}) };
            } catch { return { ownerProfileLinkFound: Boolean(ownerLink), clientProfileLinkFound: Boolean(clientLink), inspectionFailed: true }; }
        })()`);
        result.relationship = relationship;
    }
    delete result.endpointIds;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function inspectOrderReviewBundleSafe() {
    const page = await orderLivePage();
    const result = await evaluate(page, `(async () => {
        const urls = [...new Set([...document.scripts].map((node) => node.src).concat(performance.getEntriesByType('resource').map((entry) => entry.name))
            .filter((value) => { try { const url = new URL(value); return url.origin === location.origin && url.pathname.endsWith('.js'); } catch { return false; } }))];
        const matches = [];
        for (const url of urls.slice(0, 80)) {
            try {
                const text = await (await fetch(url, { method: 'GET', credentials: 'same-origin' })).text();
                let index = text.indexOf('/reviews/client/');
                if (index < 0) index = text.indexOf('reviews/client');
                if (index < 0) continue;
                matches.push({ asset: new URL(url).pathname.split('/').at(-1), snippet: text.slice(Math.max(0, index - 500), index + 700)
                    .replace(/[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}/g, 'SAFE_UUID') });
                if (matches.length >= 4) break;
            } catch { /* Ignore unrelated chunk failures. */ }
        }
        return { scanned: Math.min(urls.length, 80), matches };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function exerciseOrderLiveCyclesSafe() {
    const page = await orderLivePage();
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    const requests = [];
    const waitUntil = async (expression, timeout = 5_000) => {
        const started = Date.now();
        while (Date.now() - started < timeout) {
            if (await evaluate(page, expression)) return true;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
    };
    try {
        client.on('Network.requestWillBeSent', ({ request, initiator }) => {
            try { const url = new URL(request.url); if (url.hostname === 'vgen.co' || url.hostname === 'api.vgen.co') requests.push({ method: request.method, url, initiator: initiator?.type || '' }); } catch {}
        });
        await client.send('Network.enable');
        const cycles = [];
        for (let index = 0; index < 3; index += 1) {
            const beforeClose = await evaluate(page, `({ roots: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length,
                dialogs: document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length })`);
            const closePoint = await evaluate(page, `(() => { const modal = document.querySelector('[class*="CommissionModal__Container"]'); const value = modal?.getBoundingClientRect();
                return value ? { x: value.left + 34, y: value.top + 32 } : null; })()`);
            if (!closePoint) throw new Error('Authorized order detail close control is unavailable');
            await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: closePoint.x, y: closePoint.y, button: 'left', clickCount: 1 });
            await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: closePoint.x, y: closePoint.y, button: 'left', clickCount: 1 });
            const closed = await waitUntil(`!document.querySelector('[class*="CommissionModal__Container"]') && !document.querySelector('[data-vgen-nya-ui="order-assistant"]')`);
            const profileBeforeIdle = requests.filter((request) => { try { return request.method === 'GET' && new URL(request.url).origin === 'https://vgen.co' && new URL(request.url).pathname.split('/').filter(Boolean).length === 1; } catch { return false; } }).length;
            const idle = await evaluate(page, `(async () => { let changes = 0; const observer = new MutationObserver((records) => { for (const record of records) for (const node of [...record.addedNodes, ...record.removedNodes])
                    if (node.nodeType === 1 && (node.matches?.('[data-vgen-nya-ui="order-assistant"]') || node.querySelector?.('[data-vgen-nya-ui="order-assistant"]'))) changes += 1; });
                observer.observe(document.body, { childList: true, subtree: true }); await new Promise((resolve) => setTimeout(resolve, 4_000)); observer.disconnect();
                return { changes, roots: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length }; })()`);
            const profileAfterIdle = requests.filter((request) => { try { return request.method === 'GET' && new URL(request.url).origin === 'https://vgen.co' && new URL(request.url).pathname.split('/').filter(Boolean).length === 1; } catch { return false; } }).length;
            let reopened = null;
            if (index < 2) {
                const candidate = await evaluate(page, orderCardProbeExpression);
                if (!candidate.candidate) throw new Error('Authorized NEW commission card disappeared during cycle test');
                await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: candidate.candidate.x, y: candidate.candidate.y, button: 'left', clickCount: 1 });
                await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: candidate.candidate.x, y: candidate.candidate.y, button: 'left', clickCount: 1 });
                const mounted = await waitUntil(`document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length === 1`);
                await new Promise((resolve) => setTimeout(resolve, 700));
                reopened = await evaluate(page, `({ mounted: false, roots: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length,
                    dialogs: document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length })`);
                reopened.mounted = mounted;
            }
            cycles.push({ index: index + 1, beforeClose, closed, idle: { ...idle, profileFetches: profileAfterIdle - profileBeforeIdle }, reopened });
        }
        const profileRequests = requests.filter((request) => { try { return request.method === 'GET' && new URL(request.url).origin === 'https://vgen.co' && new URL(request.url).pathname.split('/').filter(Boolean).length === 1; } catch { return false; } });
        const writes = requests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method));
        const finalState = await evaluate(page, `({ roots: document.querySelectorAll('[data-vgen-nya-ui="order-assistant"]').length,
            styles: document.querySelectorAll('[data-vgen-nya-ui="order-assistant-style"]').length,
            dialogs: document.querySelectorAll('[role="dialog"], [aria-modal="true"]').length })`);
        process.stdout.write(`${JSON.stringify({ cycles, profileFetchesDuringCycles: profileRequests.length, toolInteractionWrites: writes.length, finalState }, null, 2)}\n`);
    } finally { client.close(); }
}

async function inspectPrivateNoteAutosaveSafety() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(() => {
        const all = []; const roots = [document];
        for (let index = 0; index < roots.length; index += 1) { const nodes = [...roots[index].querySelectorAll('*')]; all.push(...nodes);
            for (const node of nodes) if (node.shadowRoot) roots.push(node.shadowRoot); }
        const exact = all.filter((node) => /^note\s+to\s+self$/i.test((node.textContent || '').trim()));
        const inputs = all.filter((node) => node.matches?.('textarea, input, [contenteditable="true"], [data-placeholder]')).filter((node) => /note\s+to\s+self/i.test([node.getAttribute('aria-label'), node.getAttribute('placeholder'),
            node.getAttribute('data-placeholder'), node.labels?.[0]?.textContent, node.parentElement?.textContent?.slice(0, 120)].filter(Boolean).join(' ')));
        const reactInfo = (input) => { let node = input; const handlers = new Set(); for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
            const key = Object.getOwnPropertyNames(node).find((name) => name.startsWith('__reactProps$'));
            if (!key) continue; for (const name of ['onChange', 'onInput', 'onBlur', 'onKeyDown']) if (typeof node[key]?.[name] === 'function') handlers.add(name);
        } return [...handlers]; };
        return {
            url: location.pathname,
            shadowRoots: roots.length - 1,
            bodyHasNoteLabel: /note\s+to\s+self/i.test(document.body?.innerText || ''),
            frames: [...document.querySelectorAll('iframe')].map((frame) => ({ sameOrigin: Boolean(frame.contentDocument), path: (() => { try { return frame.contentWindow?.location?.pathname || ''; } catch { return 'cross-origin'; } })() })),
            exactLabels: exact.map((node) => ({ tag: node.tagName, className: String(node.className || ''), role: node.getAttribute('role'),
                parentTag: node.parentElement?.tagName, parentClass: String(node.parentElement?.className || '') })).slice(0, 20),
            inputs: inputs.map((input) => ({ tag: input.tagName, type: input.type || '', contenteditable: input.getAttribute('contenteditable'),
                placeholderKind: input.hasAttribute('placeholder') ? 'placeholder' : input.hasAttribute('data-placeholder') ? 'data-placeholder' : '', handlers: reactInfo(input),
                hasValue: Boolean(input.value), formButtons: [...(input.closest('form')?.querySelectorAll('button') || [])].map((button) =>
                    (button.textContent || button.getAttribute('aria-label') || '').trim()).filter((text) => /save|update|submit/i.test(text)).slice(0, 10) })),
            injectedRoots: document.querySelectorAll('[data-vgen-nya-ui="private-note-presets"]').length,
        };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function openPrivateNoteInspectionSurface() {
    const page = await chatLivePage();
    const target = await evaluate(page, `(() => {
        const visible = (node) => { const rect = node?.getBoundingClientRect(); return rect && rect.width > 120 && rect.height > 50 && rect.top >= 0 && rect.top < innerHeight; };
        const candidates = [...document.querySelectorAll('a[href*="commission"], [class*="CommissionCard"], [class*="commissionCard"]')].filter(visible);
        const node = candidates[0] || document.elementFromPoint(Math.min(innerWidth - 80, 460), Math.min(innerHeight - 80, 520));
        const clickable = node?.closest?.('a,button,[role="button"]') || node;
        const rect = clickable?.getBoundingClientRect();
        return rect ? { x: rect.left + rect.width / 2, y: rect.top + Math.min(rect.height / 2, 70), tag: clickable.tagName,
            className: String(clickable.className || ''), candidateCount: candidates.length } : null;
    })()`);
    if (!target) throw new Error('No visible commission detail target was found');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', clickCount: 1 });
        await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', clickCount: 1 });
    } finally { client.close(); }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    process.stdout.write(`${JSON.stringify({ opened: true, tag: target.tag, className: target.className, candidateCount: target.candidateCount }, null, 2)}\n`);
}

async function measureTextPresetIdleCleanup() {
    const page = await chatLivePage();
    const result = await evaluate(page, `(async () => {
        const close = [...document.querySelectorAll('#vgen-nya-settings-overlay button')].find((node) => node.textContent.trim() === '关闭');
        close?.click();
        const before = { settings: document.querySelectorAll('#vgen-nya-settings-overlay').length,
            upload: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            quickReplies: document.querySelectorAll('[data-vgen-nya-ui="quick-replies"]').length,
            privateNotes: document.querySelectorAll('[data-vgen-nya-ui="private-note-presets"]').length };
        let ownedMutations = 0;
        const observer = new MutationObserver((records) => { for (const record of records) {
            const nodes = [record.target, ...(record.addedNodes || []), ...(record.removedNodes || [])];
            if (nodes.some((node) => node?.matches?.('[data-vgen-nya-ui], #vgen-nya-settings-overlay') || node?.querySelector?.('[data-vgen-nya-ui], #vgen-nya-settings-overlay'))) ownedMutations += 1;
        } });
        observer.observe(document.body, { childList: true, subtree: true });
        await new Promise((resolve) => setTimeout(resolve, 4_000)); observer.disconnect();
        const after = { settings: document.querySelectorAll('#vgen-nya-settings-overlay').length,
            upload: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            quickReplies: document.querySelectorAll('[data-vgen-nya-ui="quick-replies"]').length,
            privateNotes: document.querySelectorAll('[data-vgen-nya-ui="private-note-presets"]').length };
        return { before, after, ownedMutations };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function exerciseUploadLiveRefresh() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const result = await evaluate(page, `(async () => {
        const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
        let root = document.querySelector('[data-vgen-nya-ui="upload-assistant"]');
        const overlay = document.querySelector('#vgen-nya-settings-overlay');
        if (!root || !overlay) throw new Error('Assistant/settings overlay unavailable');
        root.dataset.liveRefreshIdentity = 'preserved';
        overlay.querySelector('button[data-action="navigation"][data-id="upload"]')?.click();
        overlay.querySelector('button[data-action="tab"][data-id="text"]')?.click();
        const key = 'upload:text:title';
        let toggle = overlay.querySelector('button[data-action="section"][data-id="' + key + '"]');
        if (toggle.getAttribute('aria-expanded') !== 'true') { toggle.click(); toggle = overlay.querySelector('button[data-action="section"][data-id="' + key + '"]'); }
        const body = toggle.closest('section')?.querySelector('.vgen-nya-settings__section-body');
        const textarea = body?.querySelector('textarea[data-role="json"]');
        const save = body?.querySelector('button[data-action="save-json"]');
        textarea.value = JSON.stringify([{ id: 'live-title', name: 'LIVE Title Refreshed - DO NOT SUBMIT', value: 'VGenToolNya LIVE TEST REFRESHED - DO NOT SUBMIT' }], null, 2);
        save.click(); await pause();
        [...overlay.querySelectorAll('button')].find((node) => node.textContent.trim() === '关闭')?.click(); await pause();
        root = document.querySelector('[data-vgen-nya-ui="upload-assistant"]');
        const beforeRefresh = { assistants: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            identity: root?.dataset.liveRefreshIdentity, titleOption: root?.querySelector('select[data-kind="title"] option:last-child')?.textContent,
            quickTags: root?.querySelectorAll('button[data-action="tag"]').length, url: location.href };
        root?.querySelector('button[data-action="refresh"]')?.click(); await pause(500);
        root = document.querySelector('[data-vgen-nya-ui="upload-assistant"]');
        const afterRefresh = { assistants: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            identity: root?.dataset.liveRefreshIdentity, titleOption: root?.querySelector('select[data-kind="title"] option:last-child')?.textContent,
            quickTags: root?.querySelectorAll('button[data-action="tag"]').length, url: location.href };
        return { beforeRefresh, afterRefresh };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function cycleUploadLiveModal() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    const cycles = [];
    try {
        await client.send('Input.enable').catch(() => {});
        for (let index = 0; index < 3; index += 1) {
            const before = await evaluate(page, `(() => {
                const roots = [...document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]')];
                roots.forEach((root) => { root.dataset.liveInstanceProbe = 'cycle-${index}-before'; });
                return { dialogs: document.querySelectorAll('[role="dialog"], .ReactModal__Content').length,
                    assistants: roots.length };
            })()`);
            await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
            await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
            await waitForExpression(page, `!document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]')`, 5_000);
            await new Promise((resolve) => setTimeout(resolve, 500));
            const closed = await evaluate(page, `({
                dialogs: document.querySelectorAll('[role="dialog"], .ReactModal__Content').length,
                assistants: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
                stale: document.querySelectorAll('[data-live-instance-probe]').length,
            })`);
            const clicked = await evaluate(page, `(() => {
                const button = [...document.querySelectorAll('button')].filter((node) => {
                    const rect = node.getBoundingClientRect();
                    return node.textContent.trim() === 'New' && rect.width > 0 && rect.height > 0;
                }).at(-1);
                button?.click(); return Boolean(button);
            })()`);
            if (!clicked) throw new Error('Visible Portfolio New button was not found');
            await waitForExpression(page, `document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length === 1`, 8_000);
            const reopened = await evaluate(page, `({
                dialogs: document.querySelectorAll('[role="dialog"], .ReactModal__Content').length,
                assistants: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
                stale: document.querySelectorAll('[data-live-instance-probe]').length,
                quickTags: document.querySelectorAll('[data-vgen-nya-ui="upload-assistant"] button[data-action="tag"]').length,
            })`);
            cycles.push({ cycle: index + 1, before, closed, reopened });
        }
    } finally {
        client.close();
    }
    process.stdout.write(`${JSON.stringify({ cycles }, null, 2)}\n`);
}

async function exerciseUploadLiveCore() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const result = await evaluate(page, `(async () => {
        const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        const root = modal?.querySelector('[data-vgen-nya-ui="upload-assistant"]');
        if (!modal || !root) throw new Error('Upload modal/assistant is unavailable');
        const own = (element, prefix) => {
            const key = element ? Object.getOwnPropertyNames(element).find((name) => name.startsWith(prefix)) : null;
            return key ? element[key] : null;
        };
        const propsAlong = (element, callback) => {
            let node = element;
            for (let nodeDepth = 0; node && nodeDepth < 7; nodeDepth += 1, node = node.parentElement) {
                let fiber = own(node, '__reactFiber$') || own(node, '__reactInternalInstance$');
                for (let depth = 0; fiber && depth < 120; depth += 1, fiber = fiber.return) {
                    for (const candidate of [fiber, fiber.alternate].filter(Boolean)) {
                        for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                            const found = callback(props, candidate);
                            if (found) return found;
                        }
                    }
                }
            }
            return null;
        };
        const tagInput = [...modal.querySelectorAll('input')].find((node) => /add tags/i.test(node.placeholder || ''));
        const tagBridge = () => propsAlong(tagInput, (props, fiber) => Array.isArray(props?.initialTags) && typeof props?.onChange === 'function' ? { props, fiber } : null);
        const store = (() => {
            for (let fiber = tagBridge()?.fiber, depth = 0; fiber && depth < 120; depth += 1, fiber = fiber.return) {
                const values = [fiber.memoizedProps, fiber.pendingProps, fiber.memoizedState, fiber.stateNode];
                let dependency = fiber.dependencies?.firstContext;
                for (let i = 0; dependency && i < 20; i += 1, dependency = dependency.next) values.push(dependency.memoizedValue);
                for (const value of values) {
                    const found = [value, value?.store, value?.value, value?.value?.store, value?.contextValue, value?.contextValue?.store]
                        .find((item) => typeof item?.getState === 'function' && typeof item?.dispatch === 'function');
                    if (found) return found;
                }
            }
            return null;
        })();
        const body = () => {
            const state = store?.getState?.();
            return [state?.showcase?.body, state?.showcaseReducer?.body, ...Object.values(state || {}).map((slice) => slice?.body)]
                .find((candidate) => typeof candidate?.title === 'string' && Array.isArray(candidate?.tags));
        };
        const snapshot = () => ({
            titleInput: modal.querySelector('input[placeholder="New Showcase"]')?.value || '',
            titleState: body()?.title,
            descriptionState: body()?.description,
            tags: structuredClone(body()?.tags || tagBridge()?.props?.initialTags || []),
            discoveryState: structuredClone(body()?.searchCategoryVariantKeys || []),
            checkedDiscovery: [...modal.querySelectorAll('input[type="radio"]:checked')].map((node) => node.value),
            checkedDiscoveryHidden: [...modal.querySelectorAll('input[type="radio"]:checked')].map((node) => node.closest('[aria-hidden]')?.getAttribute('aria-hidden') ?? null),
            assistantCount: modal.querySelectorAll('[data-vgen-nya-ui="upload-assistant"]').length,
            header: root.querySelector('header')?.innerText || root.innerText.split('\\n')[0],
            pressed: [...root.querySelectorAll('button[data-action="tag"]')].filter((node) => node.getAttribute('aria-pressed') === 'true').map((node) => node.dataset.tag),
        });
        const choose = async (kind) => {
            const select = root.querySelector('select[data-kind="' + kind + '"]');
            select.selectedIndex = 1;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            await pause(500);
            return snapshot();
        };
        const titleApplied = await choose('title');
        const titleInput = modal.querySelector('input[placeholder="New Showcase"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(titleInput, 'VGenToolNya MANUAL EDIT - DO NOT SUBMIT');
        titleInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'x' }));
        titleInput.dispatchEvent(new Event('change', { bubbles: true }));
        titleInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        await pause(700);
        const titleManual = snapshot();
        const descriptionApplied = await choose('description');
        const discoveryApplied = await choose('discovery');
        const tagsInitial = snapshot();
        root.querySelector('button[data-action="tag"]')?.click();
        await pause(600);
        const tagOneAdded = snapshot();
        await tagBridge().props.onChange([]);
        await pause(600);
        const tagNativeRemoved = snapshot();
        [...root.querySelectorAll('button')].find((node) => node.textContent.trim() === '全部添加')?.click();
        await pause(600);
        const tagsAllAdded = snapshot();
        [...root.querySelectorAll('button')].find((node) => node.textContent.trim() === '全部删除')?.click();
        await pause(600);
        const tagsAllRemoved = snapshot();
        const group = root.querySelector('details');
        const groupBefore = group?.open;
        group?.querySelector('summary')?.click();
        await pause(200);
        const groupAfter = group?.open;
        if (group && !group.open) group.querySelector('summary')?.click();
        const combinationApplied = await choose('combination');
        return { titleApplied, titleManual, descriptionApplied, discoveryApplied, tagsInitial, tagOneAdded, tagNativeRemoved,
            tagsAllAdded, tagsAllRemoved, groupCollapse: { before: groupBefore, after: groupAfter }, combinationApplied,
            assistantClass: root.className, translate: root.getAttribute('translate') };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function attachUploadLiveTestImage() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const result = await evaluate(page, `(async () => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        const input = [...(modal?.querySelectorAll('input[type="file"]') || [])].find((node) => {
            const accept = node.accept || ''; return !accept || /image|png|jpeg|jpg|webp/i.test(accept);
        });
        if (!input) return { attached: false, error: 'image file input unavailable' };
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const context = canvas.getContext('2d');
        context.fillStyle = '#f0b7d5'; context.fillRect(0, 0, 64, 64);
        context.fillStyle = '#3d1630'; context.fillRect(8, 8, 48, 48);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], 'vgen-tool-nya-live-test-do-not-submit.png', { type: 'image/png', lastModified: Date.now() }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { attached: true, accept: input.accept, count: input.files.length, name: input.files[0].name };
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const after = await evaluate(page, `(() => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        return { editorCount: modal?.querySelectorAll('.descriptionEditor, [contenteditable="true"], [data-slate-editor="true"]').length || 0,
            text: (modal?.innerText || '').slice(0, 1200), images: modal?.querySelectorAll('img').length || 0 };
    })()`);
    process.stdout.write(`${JSON.stringify({ result, after }, null, 2)}\n`);
}

async function inspectUploadLiveShadowDom() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const result = await evaluate(page, `(() => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        const queue = [modal]; const roots = []; const matches = [];
        while (queue.length) {
            const root = queue.shift();
            for (const node of root?.querySelectorAll?.('*') || []) {
                if (node.shadowRoot) { roots.push({ tag: node.tagName, className: String(node.className || ''), text: (node.textContent || '').slice(0, 120) }); queue.push(node.shadowRoot); }
                if (node.matches?.('.descriptionEditor, [contenteditable="true"], [data-slate-editor="true"], [role="textbox"], textarea')) {
                    matches.push({ tag: node.tagName, className: String(node.className || ''), text: (node.innerText || node.textContent || '').slice(0, 300),
                        contenteditable: node.getAttribute('contenteditable'), slate: node.getAttribute('data-slate-editor'), root: node.getRootNode() === document ? 'document' : 'shadow' });
                }
            }
        }
        return { shadowRoots: roots, matches };
    })()`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function exerciseUploadLiveSlate() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.startsWith('https://vgen.co/creator/portfolio'));
    if (!page) throw new Error('The VGen portfolio page is not open');
    const probeExpression = `(() => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        const queue = [modal]; let editable = null;
        while (queue.length && !editable) {
            const root = queue.shift();
            editable = root?.querySelector?.('[data-slate-editor="true"][contenteditable="true"]') || null;
            for (const node of root?.querySelectorAll?.('*') || []) if (node.shadowRoot) queue.push(node.shadowRoot);
        }
        if (!editable) return { found: false };
        const own = (element, prefix) => { const key = Object.getOwnPropertyNames(element).find((name) => name.startsWith(prefix)); return key ? element[key] : null; };
        let editor = null; let fiber = own(editable, '__reactFiber$') || own(editable, '__reactInternalInstance$');
        for (let depth = 0; fiber && depth < 100 && !editor; depth += 1, fiber = fiber.return) {
            for (const candidate of [fiber, fiber.alternate].filter(Boolean)) {
                let hook = candidate.memoizedState;
                for (let i = 0; hook && i < 50; i += 1, hook = hook.next) {
                    const value = hook.memoizedState;
                    if (Array.isArray(value?.children) && typeof value.apply === 'function') { editor = value; break; }
                }
            }
        }
        return { found: true, text: editable.innerText, children: editor ? structuredClone(editor.children) : null,
            html: editable.innerHTML, focused: editable === editable.getRootNode().activeElement };
    })()`;
    const before = await evaluate(page, probeExpression);
    await evaluate(page, `(() => {
        const modal = document.querySelector('.ReactModal__Content[role="dialog"], .ReactModal__Content, [role="dialog"][aria-modal="true"], [role="dialog"]');
        const queue = [modal];
        while (queue.length) {
            const root = queue.shift(); const editable = root?.querySelector?.('[data-slate-editor="true"][contenteditable="true"]');
            if (editable) { editable.focus(); const selection = editable.getRootNode().getSelection?.() || window.getSelection(); selection?.selectAllChildren(editable); return true; }
            for (const node of root?.querySelectorAll?.('*') || []) if (node.shadowRoot) queue.push(node.shadowRoot);
        }
        return false;
    })()`);
    const client = await new CDPClient(page.webSocketDebuggerUrl).connect();
    try {
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 });
        await client.send('Input.insertText', { text: 'VGenToolNya live validation manual edit. Do not submit.' });
    } finally { client.close(); }
    await new Promise((resolve) => setTimeout(resolve, 700));
    const afterNativeEdit = await evaluate(page, probeExpression);
    await evaluate(page, `document.querySelector('input[placeholder="New Showcase"]')?.focus()`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const afterRerender = await evaluate(page, probeExpression);
    process.stdout.write(`${JSON.stringify({ before, afterNativeEdit, afterRerender }, null, 2)}\n`);
}

async function prepareUploadLiveProfile() {
    const testRoot = process.env.VGEN_NYA_TEST_ROOT;
    const chromePath = process.env.VGEN_NYA_CFT_CHROME;
    const extensionPath = process.env.VGEN_NYA_TM_EXTENSION;
    const port = Number(process.env.VGEN_NYA_LIVE_PORT || 9350);
    if (!testRoot || !chromePath || !extensionPath) {
        throw new Error('VGEN_NYA_TEST_ROOT, VGEN_NYA_CFT_CHROME and VGEN_NYA_TM_EXTENSION are required');
    }
    const scenarioRoot = path.join(testRoot, 'upload-live');
    const markerPath = path.join(scenarioRoot, 'VGEN_NYA_LIVE_PROFILE.json');
    let existingMarker = null;
    try { existingMarker = JSON.parse(await readFile(markerPath, 'utf8')); } catch { /* first launch */ }
    try {
        await access(path.join(scenarioRoot, 'profile'));
        if (!existingMarker?.managedByVGenToolNya) {
            throw new Error(`Refusing to reuse an unrecognized profile: ${path.join(scenarioRoot, 'profile')}`);
        }
    } catch (error) {
        if (error?.message?.startsWith('Refusing')) throw error;
    }

    const server = await startServer();
    try {
        const runtime = await launchIsolatedProfile({
            scenario: 'upload-live', port, testRoot, chromePath, extensionPath,
            visible: true, reusable: true,
        });
        await installUserScript('/VGenToolNya.user.js');
        const scriptSource = await readFile(path.join(projectRoot, 'dist/VGenToolNya.user.js'), 'utf8');
        const version = scriptSource.match(/^\/\/\s+@version\s+(.+)$/m)?.[1]?.trim() || 'unknown';
        await writeFile(markerPath, JSON.stringify({
            managedByVGenToolNya: true,
            purpose: 'UPLOAD-LIVE-01',
            profile: runtime.profile,
            chromePath,
            extensionPath,
            remoteDebuggingPort: port,
            installedScript: 'dist/VGenToolNya.user.js',
            installedVersion: version,
            updatedAt: new Date().toISOString(),
            restrictions: ['no-production-profile-copy', 'no-production-cookie-import', 'no-legacy-userscripts'],
        }, null, 2), 'utf8');
        const page = await newPage('https://vgen.co/creator');
        await bringToFront(page);
        process.stdout.write(`${JSON.stringify({
            ready: true,
            waitingFor: 'manual-vgen-login',
            profile: runtime.profile,
            remoteDebuggingUrl: cdpBase,
            installed: { file: 'dist/VGenToolNya.user.js', version },
            legacyScriptsInstalled: false,
            page: 'https://vgen.co/creator',
        }, null, 2)}\n`);
    } finally {
        server.close();
    }
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

async function updateUploadLiveUserscript() {
    const server = await startServer();
    try {
        await installUserScript('/VGenToolNya.user.js');
        process.stdout.write(`${JSON.stringify({ updated: true, source: 'dist/VGenToolNya.user.js' }, null, 2)}\n`);
    } finally {
        server.close();
    }
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

async function probeTampermonkeyDashboard() {
    const extensionId = process.env.VGEN_NYA_TM_EXTENSION_ID || 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
    const page = await newPage(`chrome-extension://${extensionId}/options.html#nav=dashboard`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const details = await evaluate(page, `({
        title: document.title,
        text: document.body?.innerText?.slice(0, 10000),
        controls: [...document.querySelectorAll('a,button,input')].map((node) => ({
            tag: node.tagName, id: node.id, type: node.type, value: node.value,
            text: (node.innerText || node.textContent || '').trim().slice(0, 300),
            title: node.title || '', href: node.href || '',
        })).filter((item) => /VGen|storage|menu|setting|edit/i.test([item.text,item.title,item.value,item.href].join(' '))).slice(0, 200)
    })`);
    process.stdout.write(`${JSON.stringify({ page: { id: page.id, url: page.url }, details }, null, 2)}\n`);
}

async function inspectTampermonkeyScriptRow() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.includes('options.html#nav=dashboard'));
    if (!page) throw new Error('Tampermonkey dashboard is not open');
    const details = await evaluate(page, `(() => {
        const leaf = [...document.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent.trim() === 'VGenToolNya');
        if (!leaf) return null;
        const chain = [];
        let node = leaf;
        for (let i = 0; node && i < 8; i += 1, node = node.parentElement) {
            chain.push({ tag: node.tagName, id: node.id, className: String(node.className || ''),
                role: node.getAttribute('role'), text: (node.innerText || '').trim().slice(0, 500),
                html: node.outerHTML.slice(0, 3000) });
        }
        return chain;
    })()`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function openTampermonkeyScriptEditor() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.includes('options.html#nav=dashboard'));
    if (!page) throw new Error('Tampermonkey dashboard is not open');
    const clicked = await evaluate(page, `(() => {
        const leaf = [...document.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent.trim() === 'VGenToolNya');
        const clickable = leaf?.closest('.clickable');
        if (!clickable) return false;
        clickable.click();
        return true;
    })()`);
    if (!clicked) throw new Error('VGenToolNya dashboard row was not clickable');
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const details = await evaluate(page, `({
        url: location.href,
        text: document.body.innerText.slice(0, 12000),
        tabs: [...document.querySelectorAll('button,a,div,span')].filter((node) => /^(Source|Settings|Storage|Externals)$/i.test(node.textContent.trim())).map((node) => ({
            tag: node.tagName, id: node.id, className: String(node.className || ''), text: node.textContent.trim()
        })),
    })`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function openTampermonkeyScriptSettings() {
    const page = (await targets()).find((target) => target.type === 'page' && target.url.includes('+editor'));
    if (!page) throw new Error('Tampermonkey script editor is not open');
    const details = await evaluate(page, `(() => {
        const tab = [...document.querySelectorAll('.tv_tab')].find((node) => node.textContent.trim() === 'Settings' && node.classList.contains('tv_tab_alt'));
        if (!tab) return { clicked: false };
        tab.click();
        const visible = [...document.querySelectorAll('input,textarea,select,button')].filter((node) => {
            const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
        }).map((node) => ({ tag: node.tagName, id: node.id, type: node.type, value: node.value,
            text: (node.innerText || node.textContent || '').trim().slice(0, 300), name: node.name || '' }));
        return { clicked: true, text: document.body.innerText.slice(-12000), visible };
    })()`);
    process.stdout.write(`${JSON.stringify(details, null, 2)}\n`);
}

async function probeTampermonkeyAction() {
    const extensionId = process.env.VGEN_NYA_TM_EXTENSION_ID || 'dhdgffkkebhmkfjojejmpbldmpobfkfo';
    const page = await newPage(`chrome-extension://${extensionId}/action.html`);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const details = await evaluate(page, `({
        text: document.body.innerText,
        controls: [...document.querySelectorAll('button,input,a,div')].filter((node) => {
            const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
        }).map((node) => ({ tag: node.tagName, id: node.id, className: String(node.className || ''),
            text: (node.innerText || node.textContent || '').trim().slice(0, 500), value: node.value || '', title: node.title || '' })).slice(0, 300)
    })`);
    process.stdout.write(`${JSON.stringify({ page: { id: page.id, url: page.url }, details }, null, 2)}\n`);
}

async function openTampermonkeyPopupForVGen() {
    const allTargets = await targets();
    const targetId = process.env.VGEN_NYA_CHAT_TARGET_ID;
    const targetUrl = process.env.VGEN_NYA_CHAT_TARGET_URL || 'https://vgen.co/creator/portfolio';
    const vgen = allTargets.find((target) => target.type === 'page' && (targetId ? target.id === targetId : target.url.startsWith(targetUrl)));
    const worker = allTargets.find((target) => target.type === 'service_worker' && target.url.includes('dhdgffkkebhmkfjojejmpbldmpobfkfo'));
    if (!vgen || !worker) throw new Error('VGen page or Tampermonkey service worker is unavailable');
    await bringToFront(vgen);
    const before = new Set(allTargets.map((target) => target.id));
    const client = await new CDPClient(worker.webSocketDebuggerUrl).connect();
    try {
        await client.send('Runtime.enable');
        const result = await client.send('Runtime.evaluate', { expression: 'chrome.action.openPopup()', awaitPromise: true, returnByValue: true, userGesture: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Unable to open Tampermonkey popup');
    } finally {
        client.close();
    }
    const popup = await waitForTarget((target) => target.url.includes('action.html') && !before.has(target.id), 5_000);
    const details = await evaluate(popup, `({
        text: document.body.innerText,
        controls: [...document.querySelectorAll('button,input,a,div')].filter((node) => {
            const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
        }).map((node) => ({ tag: node.tagName, id: node.id, className: String(node.className || ''),
            text: (node.innerText || node.textContent || '').trim().slice(0, 500), value: node.value || '', title: node.title || '' })).slice(0, 300)
    })`);
    process.stdout.write(`${JSON.stringify({ popup: { id: popup.id, type: popup.type, url: popup.url }, details }, null, 2)}\n`);
}

async function invokeVGenToolNyaSettingsCommand() {
    const popup = (await targets()).find((target) => target.type === 'page' && target.url.includes('action.html'));
    const targetId = process.env.VGEN_NYA_CHAT_TARGET_ID;
    const targetUrl = process.env.VGEN_NYA_CHAT_TARGET_URL || 'https://vgen.co/creator/portfolio';
    const vgen = (await targets()).find((target) => target.type === 'page' && (targetId ? target.id === targetId : target.url.startsWith(targetUrl)));
    if (!popup || !vgen) throw new Error('Tampermonkey popup or VGen page is unavailable');
    const clicked = await evaluate(popup, `(() => {
        const leaf = [...document.querySelectorAll('*')].find((node) => node.children.length === 0 && node.textContent.includes('设置'));
        const clickable = leaf?.closest('.clickable') || leaf?.parentElement;
        if (!clickable) return false;
        clickable.click();
        return true;
    })()`);
    if (!clicked) throw new Error('VGenToolNya settings menu command was not found');
    const opened = await waitForExpression(vgen, `Boolean(document.querySelector('#vgen-nya-settings-overlay'))`, 5_000);
    await bringToFront(vgen);
    process.stdout.write(`${JSON.stringify({ clicked: true, opened }, null, 2)}\n`);
}

if (process.argv.includes('--probe-install')) await probeInstall();
if (process.argv.includes('--probe-options')) await probeOptions();
if (process.argv.includes('--probe-chrome-extensions')) await probeChromeExtensions();
if (process.argv.includes('--run-full')) await runFullDeploymentL2();
if (process.argv.includes('--prepare-upload-live')) await prepareUploadLiveProfile();
if (process.argv.includes('--update-upload-live-userscript')) await updateUploadLiveUserscript();
if (process.argv.includes('--show-upload-live')) await showUploadLiveWindow();
if (process.argv.includes('--probe-upload-live')) await probeUploadLivePage();
if (process.argv.includes('--open-chat-live')) await openChatLiveOverlay();
if (process.argv.includes('--reload-chat-live')) await reloadChatLivePage();
if (process.argv.includes('--probe-chat-live')) await probeChatLive();
if (process.argv.includes('--select-chat-live')) await selectChatLiveConversation();
if (process.argv.includes('--cycle-chat-live')) await cycleChatLiveOverlay();
if (process.argv.includes('--capture-chat-live')) await captureChatLive();
if (process.argv.includes('--inspect-chat-live-layout')) await inspectChatLiveLayout();
if (process.argv.includes('--summarize-chat-live')) await summarizeChatLive();
if (process.argv.includes('--probe-frequent-clients-live')) await probeFrequentClientsLive();
if (process.argv.includes('--exercise-chat-live-jump')) await exerciseChatLiveJump();
if (process.argv.includes('--navigate-upload-live-creator')) await navigateUploadLiveCreator();
if (process.argv.includes('--navigate-upload-live-portfolio')) await navigateUploadLivePortfolio();
if (process.argv.includes('--navigate-upload-live-services')) await navigateUploadLiveServices();
if (process.argv.includes('--exercise-upload-live-service-blacklist')) await exerciseUploadLiveServiceBlacklist();
if (process.argv.includes('--measure-upload-live-cleanup')) await measureUploadLiveCleanup();
if (process.argv.includes('--open-upload-live-modal')) await openUploadLiveModal();
if (process.argv.includes('--inspect-upload-live-modal')) await inspectUploadLiveModal();
if (process.argv.includes('--inspect-upload-live-react')) await inspectUploadLiveReactState();
if (process.argv.includes('--seed-upload-live-presets')) await seedUploadLivePresetsThroughSettings();
if (process.argv.includes('--seed-text-preset-live')) await seedTextPresetLiveThroughSettings();
if (process.argv.includes('--exercise-text-preset-upload-live')) await exerciseTextPresetUploadLive();
if (process.argv.includes('--exercise-text-preset-chat-live')) await exerciseTextPresetChatLive();
if (process.argv.includes('--exercise-text-preset-chat-lifecycle')) await exerciseTextPresetChatLifecycle();
if (process.argv.includes('--inspect-text-preset-ui-live')) await inspectTextPresetUiLive();
if (process.argv.includes('--inspect-text-preset-settings-ui-live')) await inspectTextPresetSettingsUiLive();
if (process.argv.includes('--probe-vgen-targets-safe')) await probeVGenTargetsSafe();
if (process.argv.includes('--probe-order-live-neutral')) await probeOrderLiveNeutral();
if (process.argv.includes('--create-order-live-page')) await createOrderLivePage();
if (process.argv.includes('--open-order-live-safe')) await openOrderLiveSafeDetail();
if (process.argv.includes('--inspect-order-live-dom')) await inspectOrderLiveDom();
if (process.argv.includes('--inspect-order-public-reviews-safe')) await inspectOrderPublicReviewsSafe();
if (process.argv.includes('--inspect-order-native-client-reviews-safe')) await inspectOrderNativeClientReviewsSafe();
if (process.argv.includes('--inspect-order-review-id-sources-safe')) await inspectOrderReviewIdSourcesSafe();
if (process.argv.includes('--inspect-order-review-bundle-safe')) await inspectOrderReviewBundleSafe();
if (process.argv.includes('--exercise-order-live-cycles-safe')) await exerciseOrderLiveCyclesSafe();
if (process.argv.includes('--inspect-private-note-autosave-safety')) await inspectPrivateNoteAutosaveSafety();
if (process.argv.includes('--open-private-note-inspection')) await openPrivateNoteInspectionSurface();
if (process.argv.includes('--measure-text-preset-idle-cleanup')) await measureTextPresetIdleCleanup();
if (process.argv.includes('--exercise-upload-live-refresh')) await exerciseUploadLiveRefresh();
if (process.argv.includes('--cycle-upload-live-modal')) await cycleUploadLiveModal();
if (process.argv.includes('--exercise-upload-live-core')) await exerciseUploadLiveCore();
if (process.argv.includes('--attach-upload-live-test-image')) await attachUploadLiveTestImage();
if (process.argv.includes('--inspect-upload-live-shadow')) await inspectUploadLiveShadowDom();
if (process.argv.includes('--exercise-upload-live-slate')) await exerciseUploadLiveSlate();
if (process.argv.includes('--probe-tampermonkey-dashboard')) await probeTampermonkeyDashboard();
if (process.argv.includes('--inspect-tampermonkey-script-row')) await inspectTampermonkeyScriptRow();
if (process.argv.includes('--open-tampermonkey-script-editor')) await openTampermonkeyScriptEditor();
if (process.argv.includes('--open-tampermonkey-script-settings')) await openTampermonkeyScriptSettings();
if (process.argv.includes('--probe-tampermonkey-action')) await probeTampermonkeyAction();
if (process.argv.includes('--open-tampermonkey-popup-vgen')) await openTampermonkeyPopupForVGen();
if (process.argv.includes('--invoke-vgen-nya-settings')) await invokeVGenToolNyaSettingsCommand();
