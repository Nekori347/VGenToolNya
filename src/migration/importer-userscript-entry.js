import { ConfigStore, createGMStorageDriver } from '../core/config-store.js';
import { createLegacyImportUI } from './legacy-import-ui.js';

const store = new ConfigStore(createGMStorageDriver(globalThis));
const ui = createLegacyImportUI({ store });

function start() {
    try {
        ui.mount();
        GM_registerMenuCommand('VGenToolNya：导入旧配置', () => ui.open());
    } catch (error) {
        console.error('[VGenToolNya Legacy Import]', error);
        window.alert(`旧配置导入器启动失败：${error.message || error}`);
    }
}

if (document.body) start();
else document.addEventListener('DOMContentLoaded', start, { once: true });
