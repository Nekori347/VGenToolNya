import { LEGACY_KEYS } from '../../src/migration/legacy-migration.js';

export function quickTagLegacyPayload() {
    return {
        [LEGACY_KEYS.searchTagGroups]: [
            { id: 'group-b', name: 'Second', tags: [{ tag: 'b', note: 'keep me' }] },
            { id: 'group-a', name: 'First', tags: [{ tag: 'a', note: '' }] },
        ],
        [LEGACY_KEYS.copyPresets]: {
            title: [
                { id: 'title-2', name: 'T2', value: 'two', note: 'n2' },
                { id: 'title-1', name: 'T1', value: 'one', note: 'n1' },
            ],
            description: [{
                id: 'description-1',
                name: 'Rich',
                value: '[{"type":"paragraph","children":[{"text":"unchanged"}]}]',
            }],
        },
        [LEGACY_KEYS.discoveryPresets]: [{
            id: 'discovery-1',
            name: 'Discovery',
            schema: [{ optionID: 'kind', allowMultipleSelections: true, options: ['A', 'B'] }],
            values: { kind: ['B', 'A'] },
        }],
        [LEGACY_KEYS.combinationPresets]: [{
            id: 'combination-1',
            name: 'Combination',
            title: 'Combined title',
            description: '[{"type":"paragraph","children":[{"text":"combined"}]}]',
            discoverySchema: [{ optionID: 'kind', allowMultipleSelections: false }],
            discoveryValues: { kind: 'A' },
            tags: ['tag-b', 'tag-a'],
        }],
        [LEGACY_KEYS.uploadSettings]: {
            collapsed: true,
            groupExpanded: { 'group-b': true, 'group-a': false },
            modules: { global: false, title: true, description: false, discovery: true, tags: false },
            autoCollapseDiscovery: false,
            theme: 'dark',
        },
    };
}

export function toolkitLegacyPayload() {
    return {
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
