import { CONFIG_KEYS } from '../migration/legacy-migration.js';
import { isPlainObject } from '../core/value-utils.js';

export const DEFAULT_ORDER_SETTINGS = Object.freeze({
    copyButtons: true,
    clientBackground: true,
});

export function normalizeOrderSettings(value = {}) {
    const source = isPlainObject(value) ? value : {};
    return {
        copyButtons: source.copyButtons !== false,
        clientBackground: source.clientBackground !== false,
    };
}

export class OrderConfigRepository {
    #listeners = new Set();

    constructor(store) {
        this.store = store;
    }

    read() {
        return normalizeOrderSettings(this.store.read(CONFIG_KEYS.orderSettings, DEFAULT_ORDER_SETTINGS));
    }

    write(value) {
        const next = normalizeOrderSettings(value);
        this.store.writeVerified(CONFIG_KEYS.orderSettings, next, isPlainObject);
        for (const listener of this.#listeners) listener({ domain: 'order-settings', value: next });
        return next;
    }

    subscribe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }
}
