import { cloneStorageValue, storageValuesEqual } from './value-utils.js';

const MISSING = Object.freeze({ missing: true });

export class ConfigStore {
    constructor(driver) {
        if (!driver || typeof driver.getValue !== 'function' || typeof driver.setValue !== 'function') {
            throw new TypeError('ConfigStore requires getValue and setValue functions');
        }
        this.driver = driver;
    }

    has(key) {
        if (typeof this.driver.hasValue === 'function') return Boolean(this.driver.hasValue(key));
        return this.driver.getValue(key, MISSING) !== MISSING;
    }

    read(key, fallback = undefined) {
        const value = this.driver.getValue(key, MISSING);
        return value === MISSING ? cloneStorageValue(fallback) : cloneStorageValue(value);
    }

    write(key, value) {
        this.driver.setValue(key, cloneStorageValue(value));
        return cloneStorageValue(value);
    }

    writeVerified(key, value, validate = () => true) {
        if (!validate(value)) throw new TypeError(`Refusing invalid value for ${key}`);
        this.write(key, value);
        const stored = this.read(key, MISSING);
        if (stored === MISSING || !validate(stored) || !storageValuesEqual(stored, value)) {
            throw new Error(`Write verification failed for ${key}`);
        }
        return stored;
    }

    delete(key) {
        if (typeof this.driver.deleteValue !== 'function') {
            throw new Error(`Storage driver cannot delete ${key}`);
        }
        this.driver.deleteValue(key);
    }

    deleteVerified(key) {
        this.delete(key);
        if (this.has(key)) throw new Error(`Delete verification failed for ${key}`);
    }
}

export function createGMStorageDriver(gm = globalThis) {
    if (typeof gm.GM_getValue !== 'function' || typeof gm.GM_setValue !== 'function') {
        throw new TypeError('GM_getValue and GM_setValue are required');
    }
    return {
        getValue(key, fallback) {
            return gm.GM_getValue(key, fallback);
        },
        setValue(key, value) {
            gm.GM_setValue(key, value);
        },
        deleteValue(key) {
            if (typeof gm.GM_deleteValue !== 'function') {
                throw new Error('GM_deleteValue is required for transactional migration import');
            }
            gm.GM_deleteValue(key);
        },
    };
}
