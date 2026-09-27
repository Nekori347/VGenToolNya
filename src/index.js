import { Clipboard } from './core/clipboard.js';
import { ConfigStore, createGMStorageDriver } from './core/config-store.js';
import { ModuleManager } from './core/module-manager.js';
import { migrateLegacyData, readCompatibleConfig } from './migration/legacy-migration.js';
import { commitLegacyImport, prepareLegacyImport, recoverPendingLegacyImport } from './migration/legacy-importer.js';
import { createSettingsShell } from './settings/settings-shell.js';
import { SETTINGS_NAVIGATION } from './settings/navigation.js';
import { createUploadSettingsNavigation } from './settings/upload-settings.js';
import { UploadConfigRepository } from './upload/upload-config.js';
import { UploadAssistantRuntime } from './upload/upload-assistant.js';

export function createVGenNyaCore({ storageDriver, gm = globalThis } = {}) {
    const store = new ConfigStore(storageDriver || createGMStorageDriver(gm));
    const modules = new ModuleManager();
    const uploadRepository = new UploadConfigRepository(store);
    const settingsShell = createSettingsShell({ navigation: createUploadSettingsNavigation(uploadRepository, SETTINGS_NAVIGATION) });
    const uploadAssistant = new UploadAssistantRuntime({ repository: uploadRepository, documentObject: gm.document, MutationObserverClass: gm.MutationObserver });
    const clipboard = new Clipboard({ gmSetClipboard: gm.GM_setClipboard });
    modules.register('settings', settingsShell);
    modules.register('upload-assistant', uploadAssistant);

    return {
        store,
        modules,
        clipboard,
        settingsShell,
        uploadAssistant,
        uploadRepository,
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
        mountUploadAssistant() {
            modules.mount('upload-assistant');
            modules.activate('upload-assistant');
        },
        unmountUploadAssistant() {
            modules.unmount('upload-assistant');
        },
        dispose() {
            modules.disposeAll();
        },
    };
}
