import { cloneStorageValue, isPlainObject } from '../core/value-utils.js';
import { CONFIG_KEYS, readCompatibleConfig } from '../migration/legacy-migration.js';

export const UPLOAD_CONFIG_KEYS = Object.freeze([
    CONFIG_KEYS.combinationPresets,
    CONFIG_KEYS.titlePresets,
    CONFIG_KEYS.descriptionPresets,
    CONFIG_KEYS.discoveryPresets,
    CONFIG_KEYS.searchTagGroups,
    CONFIG_KEYS.uploadSettings,
    CONFIG_KEYS.uiSettings,
]);

export const DAILY_PRESET_FORMAT = 'vgen-nya.upload-presets';
export const DAILY_PRESET_VERSION = 1;

const DEFAULT_UPLOAD_SETTINGS = Object.freeze({
    collapsed: false,
    groupExpanded: {},
    modules: { global: true, title: true, description: true, discovery: true, tags: true },
    autoCollapseDiscovery: true,
});

const DEFAULT_UI_SETTINGS = Object.freeze({ theme: 'light' });

const ARRAY_DOMAINS = Object.freeze({
    combinationPresets: CONFIG_KEYS.combinationPresets,
    titlePresets: CONFIG_KEYS.titlePresets,
    descriptionPresets: CONFIG_KEYS.descriptionPresets,
    discoveryPresets: CONFIG_KEYS.discoveryPresets,
    searchTagGroups: CONFIG_KEYS.searchTagGroups,
});

function requireArray(value, label) {
    if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
    return cloneStorageValue(value);
}

function normalizeSettings(value) {
    const raw = isPlainObject(value) ? value : {};
    return {
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
    };
}

function normalizeUiSettings(value) {
    return { theme: value?.theme === 'dark' ? 'dark' : 'light' };
}

export function validateDailyPresetDocument(document) {
    if (!isPlainObject(document)) throw new TypeError('Preset import must be an object');
    if (document.format !== DAILY_PRESET_FORMAT) throw new TypeError('Unknown preset import format');
    if (document.version !== DAILY_PRESET_VERSION) throw new TypeError('Unsupported preset import version');
    if (!isPlainObject(document.payload)) throw new TypeError('Preset import payload is missing');
    const payload = {};
    for (const domain of Object.keys(ARRAY_DOMAINS)) {
        payload[domain] = requireArray(document.payload[domain], domain);
    }
    payload.uploadSettings = normalizeSettings(document.payload.uploadSettings);
    payload.uiSettings = normalizeUiSettings(document.payload.uiSettings);
    return payload;
}

export class UploadConfigRepository {
    constructor(store) {
        this.store = store;
        this.snapshot = null;
        this.listeners = new Set();
    }

    read() {
        const snapshot = {};
        for (const [domain, key] of Object.entries(ARRAY_DOMAINS)) {
            snapshot[domain] = requireArray(readCompatibleConfig(this.store, key, []).value, domain);
        }
        snapshot.uploadSettings = normalizeSettings(
            readCompatibleConfig(this.store, CONFIG_KEYS.uploadSettings, DEFAULT_UPLOAD_SETTINGS).value,
        );
        snapshot.uiSettings = normalizeUiSettings(
            readCompatibleConfig(this.store, CONFIG_KEYS.uiSettings, DEFAULT_UI_SETTINGS).value,
        );
        this.snapshot = snapshot;
        return cloneStorageValue(snapshot);
    }

    refresh() {
        const value = this.read();
        for (const listener of this.listeners) listener(cloneStorageValue(value));
        return value;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    writeDomain(domain, value) {
        const key = ARRAY_DOMAINS[domain];
        if (!key) throw new TypeError(`Unknown upload preset domain: ${domain}`);
        const next = requireArray(value, domain);
        this.store.writeVerified(key, next, Array.isArray);
        return this.refresh();
    }

    writeSettings(value) {
        const next = normalizeSettings(value);
        this.store.writeVerified(CONFIG_KEYS.uploadSettings, next, isPlainObject);
        return this.refresh();
    }

    writeUiSettings(value) {
        const next = normalizeUiSettings(value);
        this.store.writeVerified(CONFIG_KEYS.uiSettings, next, isPlainObject);
        return this.refresh();
    }

    exportDaily(exportedAt = new Date().toISOString()) {
        return {
            format: DAILY_PRESET_FORMAT,
            version: DAILY_PRESET_VERSION,
            exportedAt,
            payload: this.read(),
        };
    }

    prepareDailyImport(input) {
        let document;
        try {
            document = typeof input === 'string' ? JSON.parse(input) : cloneStorageValue(input);
        } catch (error) {
            throw new TypeError('Preset import is not valid JSON', { cause: error });
        }
        let payload;
        if (Array.isArray(document) || document?.type === 'vgen-quick-presets') {
            const current = this.read();
            const legacy = Array.isArray(document) ? { groups: document } : document;
            if (!Array.isArray(legacy.groups)) throw new TypeError('Legacy preset import has no valid groups');
            payload = {
                ...current,
                searchTagGroups: cloneStorageValue(legacy.groups),
                titlePresets: legacy.copyPresets?.title ? requireArray(legacy.copyPresets.title, 'copyPresets.title') : current.titlePresets,
                descriptionPresets: legacy.copyPresets?.description ? requireArray(legacy.copyPresets.description, 'copyPresets.description') : current.descriptionPresets,
                discoveryPresets: legacy.discoveryPresets ? requireArray(legacy.discoveryPresets, 'discoveryPresets') : current.discoveryPresets,
                combinationPresets: legacy.globalPresets ? requireArray(legacy.globalPresets, 'globalPresets') : current.combinationPresets,
                uploadSettings: normalizeSettings({ ...current.uploadSettings, ...(legacy.settings || {}) }),
            };
            document = { format: 'vgen-quick-presets', version: legacy.version ?? 'legacy-array', exportedAt: legacy.exportedAt };
        } else {
            payload = validateDailyPresetDocument(document);
        }
        return {
            kind: 'vgen-nya.upload-preset-import-plan',
            source: { format: document.format, version: document.version, exportedAt: document.exportedAt },
            payload,
            counts: Object.fromEntries(Object.keys(ARRAY_DOMAINS).map((key) => [key, payload[key].length])),
        };
    }

    commitDailyImport(plan, { confirmed = false } = {}) {
        if (!confirmed) throw new Error('Preset import requires explicit confirmation');
        if (plan?.kind !== 'vgen-nya.upload-preset-import-plan') throw new TypeError('Invalid preset import plan');
        const previous = this.read();
        const writes = [
            ...Object.entries(ARRAY_DOMAINS).map(([domain, key]) => [key, plan.payload[domain], Array.isArray]),
            [CONFIG_KEYS.uploadSettings, plan.payload.uploadSettings, isPlainObject],
            [CONFIG_KEYS.uiSettings, plan.payload.uiSettings, isPlainObject],
        ];
        try {
            for (const [key, value, validate] of writes) this.store.writeVerified(key, value, validate);
        } catch (error) {
            for (const [domain, key] of Object.entries(ARRAY_DOMAINS)) this.store.writeVerified(key, previous[domain], Array.isArray);
            this.store.writeVerified(CONFIG_KEYS.uploadSettings, previous.uploadSettings, isPlainObject);
            this.store.writeVerified(CONFIG_KEYS.uiSettings, previous.uiSettings, isPlainObject);
            throw new Error('Preset import failed and previous values were restored', { cause: error });
        }
        return this.refresh();
    }
}
