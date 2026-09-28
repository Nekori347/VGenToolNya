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
import { ChatConfigRepository } from './chat/chat-config.js';
import { ReadGate } from './chat/read-gate.js';
import { ChatNetworkHooks } from './chat/network-hooks.js';
import { ChatDiagnostics } from './chat/diagnostics.js';
import { ChatAssistantRuntime, ChatService } from './chat/chat-assistant.js';
import { FrequentClientsRuntime } from './clients/frequent-clients.js';
import { createChatSettingsNavigation } from './settings/chat-settings.js';
import { createOrderTextPresetNavigation } from './settings/order-settings.js';
import { TextPresetContextRegistry, TEXT_PRESET_CONTEXTS } from './presets/context-registry.js';
import { TextPresetStore } from './presets/text-preset-store.js';
import { TextPresetEngine } from './presets/text-preset-engine.js';
import { UploadTitlePresetAdapter } from './presets/adapters/upload-title.js';
import { UploadDescriptionPresetAdapter } from './presets/adapters/upload-description.js';
import { ChatQuickReplyPresetAdapter } from './presets/adapters/chat-quick-reply.js';
import { PrivateNotePresetAdapter } from './presets/adapters/private-note.js';
import { FinalDeliveryPresetAdapter } from './presets/adapters/final-delivery.js';
import { OrderTextPresetRuntime } from './order/order-text-presets.js';

export function createVGenNyaCore({ storageDriver, gm = globalThis, pageWindow = gm } = {}) {
    const store = new ConfigStore(storageDriver || createGMStorageDriver(gm));
    const modules = new ModuleManager();
    const uploadRepository = new UploadConfigRepository(store);
    const chatRepository = new ChatConfigRepository(store);
    const textPresetStore = new TextPresetStore({ store, uploadRepository });
    const textPresetRegistry = new TextPresetContextRegistry();
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.uploadTitle, new UploadTitlePresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.uploadDescription, new UploadDescriptionPresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.chatQuickReply, new ChatQuickReplyPresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.privateNote, new PrivateNotePresetAdapter());
    textPresetRegistry.register(TEXT_PRESET_CONTEXTS.finalDelivery, new FinalDeliveryPresetAdapter());
    const textPresetEngine = new TextPresetEngine({ store: textPresetStore, registry: textPresetRegistry });
    const readGate = new ReadGate(chatRepository.read().chatSettings);
    let diagnostics;
    const networkHooks = new ChatNetworkHooks({ windowObject: pageWindow, readGate, onDiagnosticEvent: (event) => diagnostics?.record(event) });
    diagnostics = new ChatDiagnostics({ networkHooks });
    const navigation = createOrderTextPresetNavigation(textPresetEngine, createChatSettingsNavigation(chatRepository, diagnostics, createUploadSettingsNavigation(uploadRepository, SETTINGS_NAVIGATION, textPresetEngine), textPresetEngine));
    const settingsShell = createSettingsShell({ navigation });
    const uploadAssistant = new UploadAssistantRuntime({ repository: uploadRepository, textPresetEngine, documentObject: pageWindow.document, MutationObserverClass: pageWindow.MutationObserver });
    const chat = new ChatService({ documentObject: pageWindow.document, MutationObserverClass: pageWindow.MutationObserver });
    const chatAssistant = new ChatAssistantRuntime({ repository: chatRepository, readGate, networkHooks, textPresetEngine, documentObject: pageWindow.document, MutationObserverClass: pageWindow.MutationObserver });
    const frequentClients = new FrequentClientsRuntime({ repository: chatRepository, chat, documentObject: pageWindow.document, MutationObserverClass: pageWindow.MutationObserver, fetchImpl: pageWindow.fetch?.bind(pageWindow) });
    const orderTextPresets = new OrderTextPresetRuntime({ engine: textPresetEngine, documentObject: pageWindow.document, MutationObserverClass: pageWindow.MutationObserver });
    const clipboard = new Clipboard({ gmSetClipboard: gm.GM_setClipboard });
    modules.register('settings', settingsShell);
    modules.register('upload-assistant', uploadAssistant);
    modules.register('chat-assistant', chatAssistant);
    modules.register('frequent-clients', frequentClients);
    modules.register('order-text-presets', orderTextPresets);

    return {
        store,
        modules,
        clipboard,
        settingsShell,
        uploadAssistant,
        uploadRepository,
        chatRepository,
        textPresetEngine,
        textPresetStore,
        chatAssistant,
        frequentClients,
        orderTextPresets,
        chat,
        diagnostics,
        networkHooks,
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
        mountChatAssistant() {
            modules.mount('chat-assistant');
            modules.activate('chat-assistant');
        },
        unmountChatAssistant() {
            modules.unmount('chat-assistant');
        },
        mountFrequentClients() {
            modules.mount('frequent-clients');
            modules.activate('frequent-clients');
        },
        unmountFrequentClients() {
            modules.unmount('frequent-clients');
        },
        mountOrderTextPresets() {
            modules.mount('order-text-presets');
            modules.activate('order-text-presets');
        },
        unmountOrderTextPresets() {
            modules.unmount('order-text-presets');
        },
        dispose() {
            modules.disposeAll();
            textPresetStore.dispose();
            diagnostics.dispose();
            networkHooks.dispose();
        },
    };
}
