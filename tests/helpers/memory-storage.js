import { cloneStorageValue } from '../../src/core/value-utils.js';

export class MemoryStorageDriver {
    constructor(entries = {}) {
        this.values = new Map(Object.entries(cloneStorageValue(entries)));
        this.writes = [];
    }

    hasValue(key) {
        return this.values.has(key);
    }

    getValue(key, fallback) {
        return this.values.has(key) ? cloneStorageValue(this.values.get(key)) : fallback;
    }

    setValue(key, value) {
        this.values.set(key, cloneStorageValue(value));
        this.writes.push({ key, value: cloneStorageValue(value) });
    }

    deleteValue(key) {
        this.values.delete(key);
        this.writes.push({ key, deleted: true });
    }
}
