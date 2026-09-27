export function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function cloneStorageValue(value) {
    if (value === undefined || value === null) return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function parseStoredValue(value, label = 'stored value') {
    if (typeof value !== 'string') return cloneStorageValue(value);
    try {
        return JSON.parse(value);
    } catch (error) {
        throw new TypeError(`${label} is not valid JSON`, { cause: error });
    }
}

export function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (isPlainObject(value)) {
        return `{${Object.keys(value).sort().map((key) => (
            `${JSON.stringify(key)}:${stableStringify(value[key])}`
        )).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function storageValuesEqual(left, right) {
    return stableStringify(left) === stableStringify(right);
}
