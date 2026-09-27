import { Clipboard } from './core/clipboard.js';
import { ConfigStore, createGMStorageDriver } from './core/config-store.js';
import { ModuleManager } from './core/module-manager.js';
import { migrateLegacyData, readCompatibleConfig } from './migration/legacy-migration.js';
import { commitLegacyImport, prepareLegacyImport, recoverPendingLegacyImport } from './migration/legacy-importer.js';
import { createSettingsShell } from './settings/settings-shell.js';

export function createVGenNyaCore({ storageDriver, gm = globalThis } = {}) {
    const store = new ConfigStore(storageDriver || createGMStorageDriver(gm));
    const modules = new ModuleManager();
    const settingsShell = createSettingsShell();
    const clipboard = new Clipboard({ gmSetClipboard: gm.GM_setClipboard });
    modules.register('settings', settingsShell);

    return {
        store,
        modules,
        clipboard,
        settingsShell,
        migrateLegacyData: () => migrateLegacyData(store),
        prepareLegacyImport: (inputs, options) => prepareLegacyImport(inputs, store, options),
        commitLegacyImport: (plan, options) => commitLegacyImport(plan, store, options),
        recoverPendingLegacyImport: () => recoverPendingLegacyImport(store),
        readConfig: (key, fallback) => readCompatibleConfig(store, key, fallback),
        mountSettings(host) {
            modules.mount('settings', { host });
            modules.activate('settings');
        },
        unmountSettings() {
            modules.unmount('settings');
        },
        dispose() {
            modules.disposeAll();
        },
    };
}
