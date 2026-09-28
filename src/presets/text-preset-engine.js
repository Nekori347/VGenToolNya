import { cloneStorageValue } from '../core/value-utils.js';

export const TEXT_PRESET_EXPORT_SCHEMA = 'vgen-nya.text-presets';
export const TEXT_PRESET_EXPORT_VERSION = 1;

function defaultId() {
    return globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class TextPresetEngine {
    constructor({ store, registry, idFactory = defaultId } = {}) {
        this.store = store;
        this.registry = registry;
        this.idFactory = idFactory;
        this.selected = new Map();
    }

    list(context) {
        return this.#inspect(context).valid;
    }

    #inspect(context) {
        const adapter = this.registry.get(context);
        const raw = this.store.read(context);
        const result = [];
        const ids = new Set();
        for (const item of raw) {
            const id = String(item?.id || '').trim();
            if (!id || ids.has(id) || typeof item?.name !== 'string') continue;
            try {
                const payload = adapter.deserialize(item);
                if (!adapter.validate(payload)) continue;
            } catch { continue; }
            ids.add(id);
            result.push(cloneStorageValue(item));
        }
        return { raw, valid: result, hasInvalid: result.length !== raw.length };
    }

    #writableList(context) {
        const inspected = this.#inspect(context);
        if (inspected.hasInvalid) throw new Error('Text preset collection contains invalid or duplicate data; source was left unchanged');
        return inspected.valid;
    }

    get(context, id) { return this.list(context).find((item) => String(item.id) === String(id)) || null; }

    create(context, { id = this.idFactory(), name, payload } = {}) {
        const items = this.#writableList(context);
        const normalizedId = String(id || '').trim();
        const normalizedName = String(name || '').trim();
        if (!normalizedId || items.some((item) => String(item.id) === normalizedId)) throw new Error('Text preset id must be unique');
        if (!normalizedName) throw new Error('Text preset name is required');
        const preset = this.registry.get(context).serialize(payload, { id: normalizedId, name: normalizedName });
        this.store.write(context, [...items, preset]);
        return cloneStorageValue(preset);
    }

    update(context, id, changes = {}) {
        const items = this.#writableList(context);
        const index = items.findIndex((item) => String(item.id) === String(id));
        if (index < 0) throw new Error('Text preset was not found');
        const current = items[index];
        const name = changes.name === undefined ? current.name : String(changes.name).trim();
        if (!name) throw new Error('Text preset name is required');
        const adapter = this.registry.get(context);
        const payload = changes.payload === undefined ? adapter.deserialize(current) : changes.payload;
        items[index] = adapter.serialize(payload, { ...current, id: current.id, name });
        this.store.write(context, items);
        return cloneStorageValue(items[index]);
    }

    delete(context, id) {
        const items = this.#writableList(context);
        const next = items.filter((item) => String(item.id) !== String(id));
        if (next.length === items.length) return false;
        this.store.write(context, next);
        if (this.selected.get(context) === String(id)) this.selected.delete(context);
        return true;
    }

    reorder(context, from, to) {
        const items = this.#writableList(context);
        if (![from, to].every(Number.isInteger) || from < 0 || to < 0 || from >= items.length || to >= items.length) throw new RangeError('Invalid text preset order');
        const [item] = items.splice(from, 1);
        items.splice(to, 0, item);
        this.store.write(context, items);
        return items;
    }

    preview(context, id, maximum) {
        const preset = this.get(context, id);
        if (!preset) return '';
        const adapter = this.registry.get(context);
        return adapter.preview(adapter.deserialize(preset), maximum);
    }

    async select(context, id, target, options = {}) {
        const preset = this.get(context, id);
        if (!preset) throw new Error('Text preset was not found');
        const adapter = this.registry.get(context);
        const payload = adapter.deserialize(preset);
        if (!adapter.validate(payload)) throw new TypeError('Text preset payload is invalid');
        const result = await adapter.fill(payload, target, options);
        if (result?.status === 'requires-confirmation') return { ...result, preset: cloneStorageValue(preset) };
        this.selected.set(context, String(id));
        return { status: 'filled', preset: cloneStorageValue(preset), result };
    }

    clearSelection(context) { this.selected.delete(context); }
    selectedId(context) { return this.selected.get(context) || null; }
    exportCollection(context) { return cloneStorageValue(this.list(context)); }
    exportDocument(context, exportedAt = new Date().toISOString()) {
        this.registry.get(context);
        return { schema: TEXT_PRESET_EXPORT_SCHEMA, version: TEXT_PRESET_EXPORT_VERSION, context, exportedAt, presets: this.exportCollection(context) };
    }

    prepareImport(input) {
        let document;
        try { document = typeof input === 'string' ? JSON.parse(input) : cloneStorageValue(input); }
        catch (error) { throw new TypeError('Text preset import is not valid JSON', { cause: error }); }
        if (document?.schema !== TEXT_PRESET_EXPORT_SCHEMA || document?.version !== TEXT_PRESET_EXPORT_VERSION) throw new TypeError('Unsupported text preset export schema');
        const adapter = this.registry.get(document.context);
        if (!Array.isArray(document.presets)) throw new TypeError('Text preset export has no preset array');
        const ids = new Set();
        for (const preset of document.presets) {
            const id = String(preset?.id || '').trim();
            if (!id || ids.has(id) || typeof preset?.name !== 'string') throw new TypeError('Text preset export contains invalid or duplicate entries');
            const payload = adapter.deserialize(preset);
            if (!adapter.validate(payload)) throw new TypeError('Text preset export contains invalid payload');
            ids.add(id);
        }
        return { kind: 'vgen-nya.text-preset-import-plan', context: document.context, presets: cloneStorageValue(document.presets), count: document.presets.length };
    }

    commitImport(plan, { confirmed = false } = {}) {
        if (!confirmed) throw new Error('Text preset import requires explicit confirmation');
        if (plan?.kind !== 'vgen-nya.text-preset-import-plan') throw new TypeError('Invalid text preset import plan');
        this.registry.get(plan.context);
        const previous = this.store.read(plan.context);
        try {
            this.store.write(plan.context, plan.presets);
            const written = this.store.read(plan.context);
            if (JSON.stringify(written) !== JSON.stringify(plan.presets)) throw new Error('Text preset import verification failed');
        } catch (error) {
            this.store.write(plan.context, previous);
            throw new Error('Text preset import failed and previous values were restored', { cause: error });
        }
        return this.list(plan.context);
    }
    subscribe(listener) { return this.store.subscribe(listener); }
}
