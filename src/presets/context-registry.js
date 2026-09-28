export const TEXT_PRESET_CONTEXTS = Object.freeze({
    uploadTitle: 'upload-title',
    uploadDescription: 'upload-description',
    finalDelivery: 'final-delivery',
    privateNote: 'private-note',
    chatQuickReply: 'chat-quick-reply',
});

export class TextPresetContextRegistry {
    constructor(entries = []) {
        this.contexts = new Map(entries);
    }

    register(id, adapter) {
        if (!Object.values(TEXT_PRESET_CONTEXTS).includes(id)) throw new TypeError(`Unknown text preset context: ${id}`);
        for (const method of ['serialize', 'deserialize', 'preview', 'fill', 'validate']) {
            if (typeof adapter?.[method] !== 'function') throw new TypeError(`${id} adapter requires ${method}()`);
        }
        this.contexts.set(id, adapter);
        return adapter;
    }

    get(id) {
        const adapter = this.contexts.get(id);
        if (!adapter) throw new TypeError(`Text preset context is not registered: ${id}`);
        return adapter;
    }

    has(id) { return this.contexts.has(id); }
}
