import {
    cloneStorageValue,
    isPlainObject,
    parseStoredValue,
    stableStringify,
} from '../core/value-utils.js';
import { LEGACY_KEYS } from './legacy-migration.js';

export const LEGACY_EXPORT_FORMAT = 'vgen-nya.legacy-export';
export const LEGACY_EXPORT_SCHEMA_VERSION = 1;
export const MAX_LEGACY_EXPORT_BYTES = 10 * 1024 * 1024;

export const LEGACY_SOURCES = Object.freeze({
    'vgen-tag-quick': Object.freeze({
        id: 'vgen-tag-quick',
        name: 'VGen 快速标签',
        namespace: 'https://vgen.co/',
        version: '0.9.12',
        bridgeVersion: '0.9.13',
        keys: Object.freeze([
            LEGACY_KEYS.searchTagGroups,
            LEGACY_KEYS.copyPresets,
            LEGACY_KEYS.discoveryPresets,
            LEGACY_KEYS.combinationPresets,
            LEGACY_KEYS.uploadSettings,
        ]),
    }),
    'vgen-toolkit': Object.freeze({
        id: 'vgen-toolkit',
        name: 'VGen小工具',
        namespace: 'https://vgen.co/',
        version: '0.6.0',
        bridgeVersion: '0.6.1',
        keys: Object.freeze([
            LEGACY_KEYS.clients,
            LEGACY_KEYS.toolkitSettings,
        ]),
    }),
});

function parsedShape(value, key) {
    return parseStoredValue(value, key);
}

function validateLegacyValue(key, value) {
    const parsed = parsedShape(value, key);
    if ([
        LEGACY_KEYS.searchTagGroups,
        LEGACY_KEYS.discoveryPresets,
        LEGACY_KEYS.combinationPresets,
        LEGACY_KEYS.clients,
    ].includes(key)) return Array.isArray(parsed);
    if (key === LEGACY_KEYS.copyPresets) {
        return isPlainObject(parsed) && Array.isArray(parsed.title) && Array.isArray(parsed.description);
    }
    if ([LEGACY_KEYS.uploadSettings, LEGACY_KEYS.toolkitSettings].includes(key)) {
        return isPlainObject(parsed);
    }
    return false;
}

export function validateLegacyPayload(sourceDefinition, payload) {
    if (!isPlainObject(payload)) throw new TypeError('Legacy export payload must be an object');
    const keys = Object.keys(payload);
    if (!keys.length) throw new TypeError('Legacy export payload is empty');
    for (const key of keys) {
        if (!sourceDefinition.keys.includes(key)) {
            throw new TypeError(`Unexpected legacy key for ${sourceDefinition.id}: ${key}`);
        }
        if (!validateLegacyValue(key, payload[key])) {
            throw new TypeError(`Invalid legacy value shape: ${key}`);
        }
    }
    return true;
}

async function sha256Hex(text, cryptoObject = globalThis.crypto) {
    if (!cryptoObject?.subtle) throw new Error('Web Crypto SHA-256 is unavailable');
    const bytes = new TextEncoder().encode(text);
    const digest = await cryptoObject.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function unsignedEnvelope(envelope) {
    return {
        format: envelope.format,
        schemaVersion: envelope.schemaVersion,
        source: envelope.source,
        bridgeVersion: envelope.bridgeVersion,
        exportedAt: envelope.exportedAt,
        payload: envelope.payload,
    };
}

export async function createLegacyExport({ sourceId, payload, exportedAt = new Date().toISOString(), cryptoObject } = {}) {
    const definition = LEGACY_SOURCES[sourceId];
    if (!definition) throw new TypeError(`Unknown legacy source: ${sourceId}`);
    validateLegacyPayload(definition, payload);
    const timestamp = new Date(exportedAt);
    if (Number.isNaN(timestamp.valueOf())) throw new TypeError('exportedAt must be a valid date');
    const envelope = {
        format: LEGACY_EXPORT_FORMAT,
        schemaVersion: LEGACY_EXPORT_SCHEMA_VERSION,
        source: {
            id: definition.id,
            name: definition.name,
            namespace: definition.namespace,
            version: definition.version,
        },
        bridgeVersion: definition.bridgeVersion,
        exportedAt: timestamp.toISOString(),
        payload: cloneStorageValue(payload),
    };
    envelope.integrity = {
        algorithm: 'SHA-256',
        digest: await sha256Hex(stableStringify(unsignedEnvelope(envelope)), cryptoObject),
    };
    return envelope;
}

export async function parseLegacyExport(input, { cryptoObject } = {}) {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    if (new TextEncoder().encode(text).byteLength > MAX_LEGACY_EXPORT_BYTES) {
        throw new TypeError('Legacy export exceeds the 10 MiB safety limit');
    }
    let envelope;
    try {
        envelope = typeof input === 'string' ? JSON.parse(input) : cloneStorageValue(input);
    } catch (error) {
        throw new TypeError('Legacy export is not valid JSON', { cause: error });
    }
    if (!isPlainObject(envelope)) throw new TypeError('Legacy export must be an object');
    if (envelope.format !== LEGACY_EXPORT_FORMAT) throw new TypeError('Unknown legacy export format');
    if (envelope.schemaVersion !== LEGACY_EXPORT_SCHEMA_VERSION) throw new TypeError('Unsupported legacy export schema version');
    if (!isPlainObject(envelope.source)) throw new TypeError('Legacy export source is missing');
    const definition = LEGACY_SOURCES[envelope.source.id];
    if (!definition) throw new TypeError('Unknown legacy export source');
    for (const field of ['name', 'namespace', 'version']) {
        if (envelope.source[field] !== definition[field]) {
            throw new TypeError(`Legacy export source ${field} does not match`);
        }
    }
    if (envelope.bridgeVersion !== definition.bridgeVersion) throw new TypeError('Unsupported legacy bridge version');
    if (Number.isNaN(new Date(envelope.exportedAt).valueOf())) throw new TypeError('Invalid legacy export timestamp');
    validateLegacyPayload(definition, envelope.payload);
    if (!isPlainObject(envelope.integrity) || envelope.integrity.algorithm !== 'SHA-256') {
        throw new TypeError('Legacy export integrity metadata is invalid');
    }
    if (!/^[a-f0-9]{64}$/.test(envelope.integrity.digest || '')) {
        throw new TypeError('Legacy export integrity digest is invalid');
    }
    const expected = await sha256Hex(stableStringify(unsignedEnvelope(envelope)), cryptoObject);
    if (expected !== envelope.integrity.digest) throw new TypeError('Legacy export integrity check failed');
    return cloneStorageValue(envelope);
}
