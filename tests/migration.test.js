import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigStore } from '../src/core/config-store.js';
import {
    CONFIG_KEYS,
    LEGACY_KEYS,
    migrateLegacyData,
    readCompatibleConfig,
} from '../src/migration/legacy-migration.js';
import { cloneStorageValue } from '../src/core/value-utils.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';

function legacyFixture() {
    return {
        [LEGACY_KEYS.searchTagGroups]: [
            { id: 'group-b', name: 'Second', tags: [{ tag: 'b', note: 'keep me' }], extension: 2 },
            { id: 'group-a', name: 'First', tags: [{ tag: 'a', note: '' }] },
        ],
        [LEGACY_KEYS.copyPresets]: {
            title: [
                { id: 'title-2', name: 'T2', value: 'two', note: 'n2', extension: { keep: true } },
                { id: 'title-1', name: 'T1', value: 'one', note: 'n1' },
            ],
            description: [
                {
                    id: 'description-1',
                    name: 'Rich',
                    value: '[{"type":"paragraph","children":[{"text":"unchanged"}]}]',
                },
            ],
        },
        [LEGACY_KEYS.discoveryPresets]: [
            {
                id: 'discovery-1',
                name: 'Discovery',
                schema: [{ optionID: 'kind', allowMultipleSelections: true, options: ['A', 'B'] }],
                values: { kind: ['B', 'A'] },
            },
        ],
        [LEGACY_KEYS.combinationPresets]: [
            {
                id: 'combination-1',
                name: 'Combination',
                title: 'Combined title',
                description: '[{"type":"paragraph","children":[{"text":"combined"}]}]',
                discoverySchema: [{ optionID: 'kind', allowMultipleSelections: false }],
                discoveryValues: { kind: 'A' },
                tags: ['tag-a', 'tag-b'],
            },
        ],
        [LEGACY_KEYS.uploadSettings]: {
            collapsed: true,
            groupExpanded: { 'group-a': false },
            modules: { global: false, title: true, description: false, discovery: true, tags: false },
            autoCollapseDiscovery: false,
            theme: 'dark',
        },
        [LEGACY_KEYS.clients]: [
            {
                id: 'client-2', username: 'second', url: 'https://vgen.co/second', note: 'note',
                userID: 'u2', displayName: 'Second', avatarURL: 'https://example.test/a.png',
                bannerURL: 'https://example.test/b.png', announcementMessage: 'hello',
                announcementModified: '2026-01-01', lastServiceUpdate: '2026-01-02',
                lastPortfolioUpdate: '2026-01-03', serviceFetchFailed: true,
                portfolioFetchFailed: false, profileFetchedAt: 123, createdAt: 100,
            },
            { id: 'client-1', username: 'first', customFutureField: 'preserve' },
        ],
        [LEGACY_KEYS.toolkitSettings]: {
            minHeight: 300,
            rowHeight: 60,
            collapsed: true,
            keepUnread: true,
            reactionMarkRead: false,
        },
    };
}

test('L1: all seven legacy keys migrate to separated vgen-nya domains without mutation', () => {
    const legacy = legacyFixture();
    const original = cloneStorageValue(legacy);
    const driver = new MemoryStorageDriver(legacy);
    const store = new ConfigStore(driver);

    const result = migrateLegacyData(store);

    assert.equal(result.ok, true);
    assert.equal(result.preservedLegacyKeys.length, 7);
    assert.equal(result.writes.length, 10);
    assert.deepEqual(Object.fromEntries([...driver.values].filter(([key]) => key in original)), original);

    assert.deepEqual(store.read(CONFIG_KEYS.searchTagGroups), legacy[LEGACY_KEYS.searchTagGroups]);
    assert.deepEqual(store.read(CONFIG_KEYS.titlePresets), legacy[LEGACY_KEYS.copyPresets].title);
    assert.deepEqual(store.read(CONFIG_KEYS.descriptionPresets), legacy[LEGACY_KEYS.copyPresets].description);
    assert.deepEqual(store.read(CONFIG_KEYS.discoveryPresets), legacy[LEGACY_KEYS.discoveryPresets]);
    assert.deepEqual(store.read(CONFIG_KEYS.combinationPresets), legacy[LEGACY_KEYS.combinationPresets]);
    assert.deepEqual(store.read(CONFIG_KEYS.clients), legacy[LEGACY_KEYS.clients]);

    assert.notDeepEqual(store.read(CONFIG_KEYS.combinationPresets), store.read(CONFIG_KEYS.titlePresets));
    assert.equal(store.read(CONFIG_KEYS.descriptionPresets)[0].value, legacy[LEGACY_KEYS.copyPresets].description[0].value);
    assert.equal(store.read(CONFIG_KEYS.searchTagGroups)[0].tags[0].note, 'keep me');
    assert.equal(store.read(CONFIG_KEYS.clients)[1].customFutureField, 'preserve');

    assert.deepEqual(store.read(CONFIG_KEYS.uploadSettings), {
        collapsed: true,
        groupExpanded: { 'group-a': false },
        modules: { global: false, title: true, description: false, discovery: true, tags: false },
        autoCollapseDiscovery: false,
    });
    assert.deepEqual(store.read(CONFIG_KEYS.uiSettings), { theme: 'dark' });
    assert.deepEqual(store.read(CONFIG_KEYS.clientsSettings), { minHeight: 300, rowHeight: 60, collapsed: true });
    assert.deepEqual(store.read(CONFIG_KEYS.chatSettings), { keepUnread: true, reactionMarkRead: false });
});

test('L1: migration is idempotent and a second run creates no writes or duplicate data', () => {
    const driver = new MemoryStorageDriver(legacyFixture());
    const store = new ConfigStore(driver);
    const first = migrateLegacyData(store);
    const snapshot = cloneStorageValue(Object.fromEntries(driver.values));
    const writeCount = driver.writes.length;

    const second = migrateLegacyData(store);

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.writes.length, 0);
    assert.equal(driver.writes.length, writeCount);
    assert.deepEqual(Object.fromEntries(driver.values), snapshot);
});

test('L1: existing valid new data wins while missing sibling targets still migrate', () => {
    const legacy = legacyFixture();
    const existingTitles = [{ id: 'new-only', name: 'New', value: 'newer' }];
    const driver = new MemoryStorageDriver({ ...legacy, [CONFIG_KEYS.titlePresets]: existingTitles });
    const store = new ConfigStore(driver);

    const result = migrateLegacyData(store);

    assert.equal(result.ok, true);
    assert.deepEqual(store.read(CONFIG_KEYS.titlePresets), existingTitles);
    assert.deepEqual(store.read(CONFIG_KEYS.descriptionPresets), legacy[LEGACY_KEYS.copyPresets].description);
    assert.equal(driver.writes.some(({ key }) => key === CONFIG_KEYS.titlePresets), false);
});

test('L1: compatible read converts, verifies and persists a missing new key', () => {
    const legacy = legacyFixture();
    const driver = new MemoryStorageDriver({
        [LEGACY_KEYS.discoveryPresets]: JSON.stringify(legacy[LEGACY_KEYS.discoveryPresets]),
    });
    const store = new ConfigStore(driver);

    const result = readCompatibleConfig(store, CONFIG_KEYS.discoveryPresets, []);

    assert.equal(result.source, 'legacy');
    assert.equal(result.persisted, true);
    assert.deepEqual(result.value, legacy[LEGACY_KEYS.discoveryPresets]);
    assert.deepEqual(store.read(CONFIG_KEYS.discoveryPresets), legacy[LEGACY_KEYS.discoveryPresets]);
    assert.equal(store.has(LEGACY_KEYS.discoveryPresets), true);
});

test('L1: malformed legacy data is not overwritten or deleted and reports an error', () => {
    const malformed = { title: 'not-an-array', description: [] };
    const driver = new MemoryStorageDriver({ [LEGACY_KEYS.copyPresets]: malformed });
    const store = new ConfigStore(driver);

    const result = migrateLegacyData(store);

    assert.equal(result.ok, false);
    assert.deepEqual(store.read(LEGACY_KEYS.copyPresets), malformed);
    assert.equal(store.has(CONFIG_KEYS.titlePresets), false);
    assert.equal(store.has(CONFIG_KEYS.descriptionPresets), false);
});
