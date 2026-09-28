import {
    cloneStorageValue,
    isPlainObject,
    parseStoredValue,
} from '../core/value-utils.js';

export const LEGACY_KEYS = Object.freeze({
    searchTagGroups: 'vgen-tag-presets-v1',
    copyPresets: 'vgen-copy-presets-v1',
    discoveryPresets: 'vgen-discovery-presets-v1',
    combinationPresets: 'vgen-global-presets-v1',
    uploadSettings: 'vgen-tag-quick-v3-settings',
    clients: 'vgen-toolkit-frequent-clients-v1',
    toolkitSettings: 'vgen-toolkit-settings-v2',
});

export const CONFIG_KEYS = Object.freeze({
    searchTagGroups: 'vgen-nya.search-tag-groups.v1',
    titlePresets: 'vgen-nya.title-presets.v1',
    descriptionPresets: 'vgen-nya.description-presets.v1',
    discoveryPresets: 'vgen-nya.discovery-presets.v1',
    combinationPresets: 'vgen-nya.global-presets.v1',
    uploadSettings: 'vgen-nya.upload-settings.v1',
    uiSettings: 'vgen-nya.ui-settings.v1',
    clients: 'vgen-nya.clients.v1',
    chatSettings: 'vgen-nya.chat-settings.v1',
    clientsSettings: 'vgen-nya.clients-settings.v1',
    chatQuickReplyPresets: 'vgen-nya.text-presets.chat-quick-reply.v1',
    privateNotePresets: 'vgen-nya.text-presets.private-note.v1',
    finalDeliveryPresets: 'vgen-nya.text-presets.final-delivery.v1',
    orderSettings: 'vgen-nya.order-settings.v1',
});

const isArray = Array.isArray;

function requireArray(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    return cloneStorageValue(value);
}

function requireObject(value, label) {
    if (!isPlainObject(value)) throw new TypeError(`${label} must be an object`);
    return cloneStorageValue(value);
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
}

function transformUploadSettings(value) {
    const raw = requireObject(value, LEGACY_KEYS.uploadSettings);
    return {
        [CONFIG_KEYS.uploadSettings]: {
            collapsed: Boolean(raw.collapsed),
            groupExpanded: isPlainObject(raw.groupExpanded) ? cloneStorageValue(raw.groupExpanded) : {},
            modules: {
                global: raw.modules?.global !== false,
                title: raw.modules?.title !== false,
                description: raw.modules?.description !== false,
                discovery: raw.modules?.discovery !== false,
                tags: raw.modules?.tags !== false,
            },
            autoCollapseDiscovery: raw.autoCollapseDiscovery !== false,
        },
        [CONFIG_KEYS.uiSettings]: {
            theme: raw.theme === 'dark' ? 'dark' : 'light',
        },
    };
}

function transformToolkitSettings(value) {
    const raw = requireObject(value, LEGACY_KEYS.toolkitSettings);
    return {
        [CONFIG_KEYS.clientsSettings]: {
            minHeight: clamp(Number(raw.minHeight) || 220, 120, 520),
            rowHeight: clamp(Number(raw.rowHeight) || 52, 42, 88),
            collapsed: Boolean(raw.collapsed),
        },
        [CONFIG_KEYS.chatSettings]: {
            keepUnread: Boolean(raw.keepUnread),
            reactionMarkRead: Boolean(raw.reactionMarkRead),
        },
    };
}

export const LEGACY_MIGRATION_DEFINITIONS = Object.freeze([
    {
        legacyKey: LEGACY_KEYS.searchTagGroups,
        transform: (value) => ({
            [CONFIG_KEYS.searchTagGroups]: requireArray(value, LEGACY_KEYS.searchTagGroups),
        }),
        validators: { [CONFIG_KEYS.searchTagGroups]: isArray },
    },
    {
        legacyKey: LEGACY_KEYS.copyPresets,
        transform(value) {
            const raw = requireObject(value, LEGACY_KEYS.copyPresets);
            return {
                [CONFIG_KEYS.titlePresets]: requireArray(raw.title, `${LEGACY_KEYS.copyPresets}.title`),
                [CONFIG_KEYS.descriptionPresets]: requireArray(raw.description, `${LEGACY_KEYS.copyPresets}.description`),
            };
        },
        validators: {
            [CONFIG_KEYS.titlePresets]: isArray,
            [CONFIG_KEYS.descriptionPresets]: isArray,
        },
    },
    {
        legacyKey: LEGACY_KEYS.discoveryPresets,
        transform: (value) => ({
            [CONFIG_KEYS.discoveryPresets]: requireArray(value, LEGACY_KEYS.discoveryPresets),
        }),
        validators: { [CONFIG_KEYS.discoveryPresets]: isArray },
    },
    {
        legacyKey: LEGACY_KEYS.combinationPresets,
        transform: (value) => ({
            [CONFIG_KEYS.combinationPresets]: requireArray(value, LEGACY_KEYS.combinationPresets),
        }),
        validators: { [CONFIG_KEYS.combinationPresets]: isArray },
    },
    {
        legacyKey: LEGACY_KEYS.uploadSettings,
        transform: transformUploadSettings,
        validators: {
            [CONFIG_KEYS.uploadSettings]: isPlainObject,
            [CONFIG_KEYS.uiSettings]: isPlainObject,
        },
    },
    {
        legacyKey: LEGACY_KEYS.clients,
        transform: (value) => ({
            [CONFIG_KEYS.clients]: requireArray(value, LEGACY_KEYS.clients),
        }),
        validators: { [CONFIG_KEYS.clients]: isArray },
    },
    {
        legacyKey: LEGACY_KEYS.toolkitSettings,
        transform: transformToolkitSettings,
        validators: {
            [CONFIG_KEYS.clientsSettings]: isPlainObject,
            [CONFIG_KEYS.chatSettings]: isPlainObject,
        },
    },
]);

const resolverByNewKey = new Map();
for (const definition of LEGACY_MIGRATION_DEFINITIONS) {
    for (const newKey of Object.keys(definition.validators)) {
        resolverByNewKey.set(newKey, definition);
    }
}

function prepareDefinition(store, definition) {
    if (!store.has(definition.legacyKey)) {
        return { legacyKey: definition.legacyKey, status: 'legacy-absent', targets: [] };
    }
    const raw = store.read(definition.legacyKey);
    const parsed = parseStoredValue(raw, definition.legacyKey);
    const outputs = definition.transform(parsed);
    const targets = Object.entries(outputs).map(([key, value]) => {
        const validate = definition.validators[key];
        if (!validate?.(value)) throw new TypeError(`Migration produced invalid value for ${key}`);
        if (!store.has(key)) return { key, value, validate, status: 'pending' };
        const existing = store.read(key);
        if (!validate(existing)) throw new TypeError(`Existing new value is invalid: ${key}`);
        return { key, value: existing, validate, status: 'existing-new' };
    });
    return { legacyKey: definition.legacyKey, status: 'prepared', targets };
}

export function migrateLegacyData(store) {
    const result = { ok: true, writes: [], sources: [], preservedLegacyKeys: [] };
    for (const definition of LEGACY_MIGRATION_DEFINITIONS) {
        let source;
        try {
            source = prepareDefinition(store, definition);
            if (source.status === 'legacy-absent') {
                result.sources.push(source);
                continue;
            }
            result.preservedLegacyKeys.push(definition.legacyKey);
            for (const target of source.targets) {
                if (target.status === 'existing-new') continue;
                store.writeVerified(target.key, target.value, target.validate);
                target.status = 'migrated';
                result.writes.push(target.key);
            }
            source.status = source.targets.some((target) => target.status === 'migrated')
                ? 'migrated'
                : 'already-migrated';
            result.sources.push(source);
        } catch (error) {
            result.ok = false;
            result.sources.push({
                legacyKey: definition.legacyKey,
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return result;
}

export function getLegacyMigrationDefinition(legacyKey) {
    return LEGACY_MIGRATION_DEFINITIONS.find((definition) => definition.legacyKey === legacyKey) || null;
}

export function convertLegacyValue(legacyKey, rawValue) {
    const definition = getLegacyMigrationDefinition(legacyKey);
    if (!definition) throw new TypeError(`Unsupported legacy key: ${legacyKey}`);
    const parsed = parseStoredValue(rawValue, legacyKey);
    const outputs = definition.transform(parsed);
    for (const [key, value] of Object.entries(outputs)) {
        const validate = definition.validators[key];
        if (!validate?.(value)) throw new TypeError(`Migration produced invalid value for ${key}`);
    }
    return {
        legacyKey,
        outputs: cloneStorageValue(outputs),
        validators: definition.validators,
    };
}

export function readCompatibleConfig(store, key, fallback = undefined) {
    if (store.has(key)) return { value: store.read(key), source: 'new', persisted: true };
    const definition = resolverByNewKey.get(key);
    if (!definition || !store.has(definition.legacyKey)) {
        return { value: cloneStorageValue(fallback), source: 'fallback', persisted: false };
    }
    const parsed = parseStoredValue(store.read(definition.legacyKey), definition.legacyKey);
    const outputs = definition.transform(parsed);
    const value = outputs[key];
    const validate = definition.validators[key];
    if (!validate?.(value)) throw new TypeError(`Legacy conversion produced invalid value for ${key}`);
    store.writeVerified(key, value, validate);
    return { value: cloneStorageValue(value), source: 'legacy', persisted: true };
}
