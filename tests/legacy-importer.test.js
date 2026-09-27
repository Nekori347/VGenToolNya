import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigStore } from '../src/core/config-store.js';
import { cloneStorageValue } from '../src/core/value-utils.js';
import { createLegacyExport } from '../src/migration/legacy-export-schema.js';
import {
    commitLegacyImport,
    LegacyImportTransactionError,
    MIGRATION_STAGING_KEY,
    prepareLegacyImport,
    recoverPendingLegacyImport,
} from '../src/migration/legacy-importer.js';
import { CONFIG_KEYS, LEGACY_KEYS } from '../src/migration/legacy-migration.js';
import { createLegacyImportUI } from '../src/migration/legacy-import-ui.js';
import { quickTagLegacyPayload, toolkitLegacyPayload } from './helpers/legacy-fixtures.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';
import { MiniDocument } from './helpers/mini-dom.js';

async function exportsForTest() {
    return {
        quick: JSON.stringify(await createLegacyExport({ sourceId: 'vgen-tag-quick', payload: quickTagLegacyPayload() })),
        toolkit: JSON.stringify(await createLegacyExport({ sourceId: 'vgen-toolkit', payload: toolkitLegacyPayload() })),
    };
}

function newStore(entries = {}) {
    const driver = new MemoryStorageDriver(entries);
    return { driver, store: new ConfigStore(driver) };
}

async function importFilesInOrder(files) {
    const { driver, store } = newStore();
    for (const file of files) {
        const plan = await prepareLegacyImport([file], store);
        commitLegacyImport(plan, store, { confirmed: true });
    }
    return { driver, store };
}

test('Deployment L2: preview reports source, versions, categories, counts, target keys and no writes', async () => {
    const files = await exportsForTest();
    const { driver, store } = newStore();
    const plan = await prepareLegacyImport([files.quick, files.toolkit], store);

    assert.deepEqual(plan.sources.map((source) => source.source.id), ['vgen-tag-quick', 'vgen-toolkit']);
    assert.equal(plan.targets.length, 10);
    assert.equal(plan.targets.find((target) => target.key === CONFIG_KEYS.searchTagGroups).count, 2);
    assert.equal(plan.targets.find((target) => target.key === CONFIG_KEYS.clients).count, 2);
    assert.equal(plan.targets.every((target) => target.status === 'ready'), true);
    assert.equal(driver.writes.length, 0);
});

test('Deployment L2: Quick Tag then Toolkit and reverse order produce identical new data', async () => {
    const files = await exportsForTest();
    const first = await importFilesInOrder([files.quick, files.toolkit]);
    const second = await importFilesInOrder([files.toolkit, files.quick]);

    for (const key of Object.values(CONFIG_KEYS)) {
        assert.deepEqual(first.store.read(key), second.store.read(key), key);
    }
    assert.deepEqual(first.store.read(CONFIG_KEYS.searchTagGroups), quickTagLegacyPayload()[LEGACY_KEYS.searchTagGroups]);
    assert.deepEqual(first.store.read(CONFIG_KEYS.clients), toolkitLegacyPayload()[LEGACY_KEYS.clients]);
});

test('Deployment L2: two files in one import and split imports preserve order and Slate JSON', async () => {
    const files = await exportsForTest();
    const combinedContext = newStore();
    const combinedPlan = await prepareLegacyImport([files.toolkit, files.quick], combinedContext.store);
    commitLegacyImport(combinedPlan, combinedContext.store, { confirmed: true });
    const split = await importFilesInOrder([files.quick, files.toolkit]);

    assert.deepEqual(
        combinedContext.store.read(CONFIG_KEYS.titlePresets).map((item) => item.id),
        ['title-2', 'title-1'],
    );
    assert.equal(
        combinedContext.store.read(CONFIG_KEYS.descriptionPresets)[0].value,
        quickTagLegacyPayload()[LEGACY_KEYS.copyPresets].description[0].value,
    );
    assert.deepEqual(Object.fromEntries(combinedContext.driver.values), Object.fromEntries(split.driver.values));
});

test('Deployment L2: repeating the same import creates no duplicates or additional config writes', async () => {
    const files = await exportsForTest();
    const { driver, store } = newStore();
    const firstPlan = await prepareLegacyImport([files.quick, files.toolkit], store);
    commitLegacyImport(firstPlan, store, { confirmed: true });
    const snapshot = cloneStorageValue(Object.fromEntries(driver.values));
    const writesBefore = driver.writes.length;

    const repeatedPlan = await prepareLegacyImport([files.quick, files.toolkit], store);
    const result = commitLegacyImport(repeatedPlan, store, { confirmed: true });

    assert.equal(repeatedPlan.alreadyMigrated, true);
    assert.equal(result.committed, false);
    assert.equal(driver.writes.length, writesBefore);
    assert.deepEqual(Object.fromEntries(driver.values), snapshot);
});

test('Deployment L2: existing new values are visible conflicts and are never overwritten', async () => {
    const files = await exportsForTest();
    const existing = [{ id: 'new', name: 'Keep New', value: 'new' }];
    const { store } = newStore({ [CONFIG_KEYS.titlePresets]: existing });
    const plan = await prepareLegacyImport([files.quick], store);
    const target = plan.targets.find((item) => item.key === CONFIG_KEYS.titlePresets);

    assert.equal(plan.hasConflicts, true);
    assert.equal(target.status, 'conflict');
    const result = commitLegacyImport(plan, store, { confirmed: true });
    assert.deepEqual(store.read(CONFIG_KEYS.titlePresets), existing);
    assert.equal(result.skippedConflicts.some((item) => item.key === CONFIG_KEYS.titlePresets), true);
    assert.equal(store.has(CONFIG_KEYS.descriptionPresets), true);
});

test('Deployment L2: selection and preview do not write; explicit UI confirmation does', async () => {
    const files = await exportsForTest();
    const { driver, store } = newStore();
    const documentObject = new MiniDocument();
    const ui = createLegacyImportUI({ store, documentObject });
    ui.mount();
    const fakeFiles = [
        { text: async () => files.quick },
        { text: async () => files.toolkit },
    ];

    await ui.prepareFiles(fakeFiles);
    assert.equal(ui.pendingPlan.targets.length, 10);
    assert.equal(driver.writes.length, 0);

    const result = ui.confirmImport();
    assert.equal(result.writes.length, 10);
    assert.equal(store.has(CONFIG_KEYS.clients), true);
});

test('Deployment L2: a mid-commit failure rolls back every target and removes staging', async () => {
    const files = await exportsForTest();
    class FailingDriver extends MemoryStorageDriver {
        configWrites = 0;
        setValue(key, value) {
            if (key.startsWith('vgen-nya.') && key !== MIGRATION_STAGING_KEY) {
                this.configWrites += 1;
                if (this.configWrites === 3) throw new Error('injected write failure');
            }
            super.setValue(key, value);
        }
    }
    const driver = new FailingDriver();
    const store = new ConfigStore(driver);
    const plan = await prepareLegacyImport([files.quick], store);

    assert.throws(
        () => commitLegacyImport(plan, store, { confirmed: true }),
        (error) => error instanceof LegacyImportTransactionError && error.rollbackSucceeded,
    );
    for (const key of Object.values(CONFIG_KEYS)) assert.equal(store.has(key), false, key);
    assert.equal(store.has(MIGRATION_STAGING_KEY), false);
});

test('Deployment L2: a retained recognized journal restores an interrupted import on next run', () => {
    const beforeTitle = [{ id: 'before', name: 'Before', value: 'before' }];
    const partialDescription = [{ id: 'partial', name: 'Partial', value: 'partial' }];
    const journal = {
        kind: 'vgen-nya.legacy-import-journal',
        version: 1,
        transactionId: 'crash-test',
        createdAt: new Date().toISOString(),
        targets: [
            { key: CONFIG_KEYS.titlePresets, before: { exists: true, value: beforeTitle } },
            { key: CONFIG_KEYS.descriptionPresets, before: { exists: false } },
        ],
    };
    const { store } = newStore({
        [CONFIG_KEYS.titlePresets]: [{ id: 'partial-title' }],
        [CONFIG_KEYS.descriptionPresets]: partialDescription,
        [MIGRATION_STAGING_KEY]: journal,
    });

    const result = recoverPendingLegacyImport(store);

    assert.equal(result.recovered, true);
    assert.deepEqual(store.read(CONFIG_KEYS.titlePresets), beforeTitle);
    assert.equal(store.has(CONFIG_KEYS.descriptionPresets), false);
    assert.equal(store.has(MIGRATION_STAGING_KEY), false);
});

test('Deployment L2: commit is impossible without explicit confirmation', async () => {
    const files = await exportsForTest();
    const { store } = newStore();
    const plan = await prepareLegacyImport([files.quick], store);
    assert.throws(() => commitLegacyImport(plan, store), /explicit confirmation/);
    assert.equal(store.has(CONFIG_KEYS.searchTagGroups), false);
});
