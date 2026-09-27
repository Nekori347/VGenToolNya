import { cloneStorageValue, storageValuesEqual } from '../core/value-utils.js';
import {
    CONFIG_KEYS,
    convertLegacyValue,
    getLegacyMigrationDefinition,
} from './legacy-migration.js';
import { LEGACY_SOURCES, parseLegacyExport } from './legacy-export-schema.js';

export const MIGRATION_STAGING_KEY = 'vgen-nya.migration-staging.v1';
const JOURNAL_VERSION = 1;
const targetLabels = Object.freeze({
    [CONFIG_KEYS.searchTagGroups]: 'Search Tag Preset groups',
    [CONFIG_KEYS.titlePresets]: 'Title Preset',
    [CONFIG_KEYS.descriptionPresets]: 'Description Preset',
    [CONFIG_KEYS.discoveryPresets]: 'Discovery Preset',
    [CONFIG_KEYS.combinationPresets]: 'Combination / Global Preset',
    [CONFIG_KEYS.uploadSettings]: 'Upload settings',
    [CONFIG_KEYS.uiSettings]: 'UI settings',
    [CONFIG_KEYS.clients]: 'Frequent clients',
    [CONFIG_KEYS.chatSettings]: 'Chat settings',
    [CONFIG_KEYS.clientsSettings]: 'Frequent clients settings',
});

function countEntries(value) {
    return Array.isArray(value) ? value.length : 1;
}

function transactionId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `migration-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function statusForTarget(store, key, value, validate) {
    if (!store.has(key)) return { status: 'ready', conflict: false, alreadyMigrated: false };
    const existing = store.read(key);
    if (validate(existing) && storageValuesEqual(existing, value)) {
        return { status: 'already-migrated', conflict: false, alreadyMigrated: true };
    }
    return {
        status: 'conflict',
        conflict: true,
        alreadyMigrated: false,
        reason: validate(existing) ? 'different-new-value' : 'invalid-existing-new-value',
    };
}

function planEnvelope(envelope, store) {
    const definition = LEGACY_SOURCES[envelope.source.id];
    const targets = [];
    for (const legacyKey of definition.keys) {
        if (!Object.hasOwn(envelope.payload, legacyKey)) continue;
        const converted = convertLegacyValue(legacyKey, envelope.payload[legacyKey]);
        for (const [key, value] of Object.entries(converted.outputs)) {
            const validate = converted.validators[key];
            targets.push({
                sourceId: envelope.source.id,
                legacyKey,
                key,
                label: targetLabels[key] || key,
                count: countEntries(value),
                value: cloneStorageValue(value),
                ...statusForTarget(store, key, value, validate),
            });
        }
    }
    return {
        source: cloneStorageValue(envelope.source),
        bridgeVersion: envelope.bridgeVersion,
        exportedAt: envelope.exportedAt,
        digest: envelope.integrity.digest,
        targets,
        alreadyMigrated: targets.length > 0 && targets.every((target) => target.alreadyMigrated),
        hasConflicts: targets.some((target) => target.conflict),
    };
}

export async function prepareLegacyImport(inputs, store, options = {}) {
    if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 2) {
        throw new TypeError('Select one or two legacy export files');
    }
    const envelopes = await Promise.all(inputs.map((input) => parseLegacyExport(input, options)));
    const unique = new Map();
    let duplicateFilesIgnored = 0;
    for (const envelope of envelopes) {
        const previous = unique.get(envelope.source.id);
        if (!previous) {
            unique.set(envelope.source.id, envelope);
            continue;
        }
        if (previous.integrity.digest !== envelope.integrity.digest) {
            throw new TypeError(`Two different exports were selected for ${envelope.source.name}`);
        }
        duplicateFilesIgnored += 1;
    }
    const sources = [...unique.values()].map((envelope) => planEnvelope(envelope, store));
    const targets = sources.flatMap((source) => source.targets);
    return {
        kind: 'vgen-nya.legacy-import-plan',
        createdAt: new Date().toISOString(),
        sources,
        targets,
        duplicateFilesIgnored,
        hasConflicts: targets.some((target) => target.conflict),
        alreadyMigrated: targets.length > 0 && targets.every((target) => target.alreadyMigrated),
        requiresConfirmation: true,
    };
}

function validateJournal(value) {
    return Boolean(
        value
        && value.kind === 'vgen-nya.legacy-import-journal'
        && value.version === JOURNAL_VERSION
        && typeof value.transactionId === 'string'
        && Array.isArray(value.targets)
        && value.targets.every((target) => (
            target
            && typeof target.key === 'string'
            && Object.values(CONFIG_KEYS).includes(target.key)
            && target.before
            && typeof target.before.exists === 'boolean'
        )),
    );
}

function restoreTarget(store, target) {
    if (target.before.exists) {
        store.write(target.key, target.before.value);
        const restored = store.read(target.key);
        if (!storageValuesEqual(restored, target.before.value)) {
            throw new Error(`Rollback verification failed for ${target.key}`);
        }
    } else {
        store.deleteVerified(target.key);
    }
}

export function recoverPendingLegacyImport(store) {
    if (!store.has(MIGRATION_STAGING_KEY)) return { recovered: false, targets: [] };
    const journal = store.read(MIGRATION_STAGING_KEY);
    if (!validateJournal(journal)) {
        throw new Error('Unrecognized migration staging journal; refusing automatic changes');
    }
    const restored = [];
    for (const target of [...journal.targets].reverse()) {
        restoreTarget(store, target);
        restored.push(target.key);
    }
    store.deleteVerified(MIGRATION_STAGING_KEY);
    return { recovered: true, transactionId: journal.transactionId, targets: restored };
}

export class LegacyImportTransactionError extends Error {
    constructor(message, { cause, rollbackSucceeded, transactionId } = {}) {
        super(message, { cause });
        this.name = 'LegacyImportTransactionError';
        this.rollbackSucceeded = rollbackSucceeded;
        this.transactionId = transactionId;
    }
}

export function commitLegacyImport(plan, store, { confirmed = false } = {}) {
    if (!confirmed) throw new Error('Legacy import requires explicit confirmation');
    if (!plan || plan.kind !== 'vgen-nya.legacy-import-plan' || !Array.isArray(plan.targets)) {
        throw new TypeError('Invalid legacy import plan');
    }
    const recovery = recoverPendingLegacyImport(store);
    const ready = [];
    const skippedConflicts = [];
    const skippedExisting = [];
    for (const target of plan.targets) {
        const definition = getLegacyMigrationDefinition(target.legacyKey);
        const validate = definition?.validators[target.key];
        if (!validate?.(target.value)) throw new TypeError(`Invalid planned target: ${target.key}`);
        const current = statusForTarget(store, target.key, target.value, validate);
        if (current.status === 'already-migrated') {
            skippedExisting.push(target.key);
            continue;
        }
        if (current.status === 'conflict') {
            if (target.status === 'ready') {
                throw new Error(`Configuration changed after preview: ${target.key}`);
            }
            skippedConflicts.push({ key: target.key, reason: current.reason });
            continue;
        }
        if (target.status === 'conflict') {
            skippedConflicts.push({ key: target.key, reason: target.reason });
            continue;
        }
        ready.push({ ...target, validate });
    }
    if (!ready.length) {
        return { committed: false, writes: [], skippedExisting, skippedConflicts, recovery };
    }

    const id = transactionId();
    const journal = {
        kind: 'vgen-nya.legacy-import-journal',
        version: JOURNAL_VERSION,
        transactionId: id,
        createdAt: new Date().toISOString(),
        targets: ready.map((target) => ({
            key: target.key,
            before: store.has(target.key)
                ? { exists: true, value: store.read(target.key) }
                : { exists: false },
        })),
    };
    const written = [];
    try {
        store.writeVerified(MIGRATION_STAGING_KEY, journal, validateJournal);
        for (const target of ready) {
            store.writeVerified(target.key, target.value, target.validate);
            written.push(target.key);
        }
        for (const target of ready) {
            if (!storageValuesEqual(store.read(target.key), target.value)) {
                throw new Error(`Final verification failed for ${target.key}`);
            }
        }
        store.deleteVerified(MIGRATION_STAGING_KEY);
        return {
            committed: true,
            transactionId: id,
            writes: written,
            skippedExisting,
            skippedConflicts,
            recovery,
        };
    } catch (cause) {
        let rollbackSucceeded = true;
        try {
            for (const target of [...journal.targets].reverse()) restoreTarget(store, target);
            if (store.has(MIGRATION_STAGING_KEY)) store.deleteVerified(MIGRATION_STAGING_KEY);
        } catch {
            rollbackSucceeded = false;
        }
        throw new LegacyImportTransactionError(
            rollbackSucceeded
                ? 'Legacy import failed and all writes were rolled back'
                : 'Legacy import failed; recovery journal was retained for the next run',
            { cause, rollbackSucceeded, transactionId: id },
        );
    }
}
