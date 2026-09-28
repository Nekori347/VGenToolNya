import { cloneStorageValue } from '../core/value-utils.js';
import { CONFIG_KEYS } from '../migration/legacy-migration.js';
import { TEXT_PRESET_CONTEXTS } from './context-registry.js';

export const TEXT_PRESET_KEYS = Object.freeze({
    [TEXT_PRESET_CONTEXTS.chatQuickReply]: CONFIG_KEYS.chatQuickReplyPresets,
    [TEXT_PRESET_CONTEXTS.privateNote]: CONFIG_KEYS.privateNotePresets,
    [TEXT_PRESET_CONTEXTS.finalDelivery]: CONFIG_KEYS.finalDeliveryPresets,
});

export class TextPresetStore {
    constructor({ store, uploadRepository } = {}) {
        this.store = store;
        this.uploadRepository = uploadRepository;
        this.listeners = new Set();
        this.unsubscribeUpload = uploadRepository?.subscribe?.(() => this.#emit('upload')) || null;
    }

    read(context) {
        if (context === TEXT_PRESET_CONTEXTS.uploadTitle) return this.#upload('titlePresets');
        if (context === TEXT_PRESET_CONTEXTS.uploadDescription) return this.#upload('descriptionPresets');
        const key = TEXT_PRESET_KEYS[context];
        if (!key) throw new TypeError(`Unknown text preset context: ${context}`);
        const value = this.store.read(key, []);
        return cloneStorageValue(value);
    }

    write(context, value) {
        if (!Array.isArray(value)) throw new TypeError('Text preset collection must be an array');
        const next = cloneStorageValue(value);
        if (context === TEXT_PRESET_CONTEXTS.uploadTitle) return this.uploadRepository.writeDomain('titlePresets', next).titlePresets;
        if (context === TEXT_PRESET_CONTEXTS.uploadDescription) return this.uploadRepository.writeDomain('descriptionPresets', next).descriptionPresets;
        const key = TEXT_PRESET_KEYS[context];
        if (!key) throw new TypeError(`Unknown text preset context: ${context}`);
        const stored = this.store.writeVerified(key, next, Array.isArray);
        this.#emit(context);
        return cloneStorageValue(stored);
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    dispose() {
        this.unsubscribeUpload?.();
        this.unsubscribeUpload = null;
        this.listeners.clear();
    }

    #upload(domain) {
        const value = this.uploadRepository?.read?.()[domain];
        return Array.isArray(value) ? cloneStorageValue(value) : [];
    }

    #emit(context) {
        for (const listener of this.listeners) listener({ context });
    }
}
