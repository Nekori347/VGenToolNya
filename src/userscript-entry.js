import { createVGenNyaCore } from './index.js';

const APP_VERSION = __VGEN_NYA_APP_VERSION__;
const pageWindow = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : globalThis;
const core = createVGenNyaCore({ gm: globalThis, pageWindow });
let overlay = null;
let keydownHandler = null;

function closeSettings() {
    if (!overlay) return;
    core.unmountSettings();
    if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
    overlay.remove();
    overlay = null;
    keydownHandler = null;
}

function openSettings() {
    if (overlay) {
        overlay.hidden = false;
        return;
    }
    const documentObject = globalThis.document;
    if (!documentObject?.body) throw new Error('Document body is unavailable');

    overlay = documentObject.createElement('div');
    overlay.id = 'vgen-nya-settings-overlay';
    overlay.className = 'notranslate';
    overlay.dataset.vgenNyaUi = 'settings-overlay';
    overlay.translate = false;
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483646', 'overflow:auto',
        'padding:24px', 'background:rgba(0,0,0,.52)', 'box-sizing:border-box',
    ].join(';');

    const frame = documentObject.createElement('div');
    frame.style.cssText = 'position:relative;max-width:1040px;margin:0 auto';
    const closeButton = documentObject.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '关闭';
    closeButton.title = `VGenToolNya ${APP_VERSION}`;
    closeButton.style.cssText = [
        'display:block', 'margin:0 0 8px auto', 'padding:7px 12px',
        'border:1px solid #bbb', 'border-radius:8px', 'background:#fff', 'cursor:pointer',
    ].join(';');
    const host = documentObject.createElement('div');
    frame.append(closeButton, host);
    overlay.append(frame);
    documentObject.body.append(overlay);

    closeButton.addEventListener('click', closeSettings, { once: true });
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeSettings();
    });
    keydownHandler = (event) => {
        if (event.key === 'Escape') closeSettings();
    };
    documentObject.addEventListener('keydown', keydownHandler);
    core.mountSettings(host);
}

function start() {
    GM_registerMenuCommand(`VGenToolNya ${APP_VERSION}：设置`, openSettings);
    core.mountUploadAssistant();
    core.mountChatAssistant();
    core.mountGlobalSearch();
    core.mountFrequentClients();
    core.mountOrderAssistant();
    core.mountReviewAssistant();
    core.mountOrderTextPresets();
    // Order text presets are fill-only (never save / deliver). Final Delivery
    // mounts automatically when its input appears; live verification stays
    // BLOCKED until a delivery-stage order is safely available.
}

start();
