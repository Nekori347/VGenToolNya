// ==UserScript==
// @name         VGen 快速标签
// @namespace    https://vgen.co/
// @version      0.9.12
// @description  Deployment L2 isolated-profile fixture only.
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_setValue
// ==/UserScript==

(() => {
    'use strict';
    GM_setValue('vgen-tag-presets-v1', [
        { id: 'group-b', name: 'Second', tags: [{ tag: 'b', note: 'keep me' }] },
        { id: 'group-a', name: 'First', tags: [{ tag: 'a', note: '' }] },
    ]);
    GM_setValue('vgen-copy-presets-v1', {
        title: [
            { id: 'title-2', name: 'T2', value: 'two', note: 'n2' },
            { id: 'title-1', name: 'T1', value: 'one', note: 'n1' },
        ],
        description: [{
            id: 'description-1',
            name: 'Rich',
            value: '[{"type":"paragraph","children":[{"text":"unchanged"}]}]',
        }],
    });
    GM_setValue('vgen-discovery-presets-v1', [{
        id: 'discovery-1', name: 'Discovery',
        schema: [{ optionID: 'kind', allowMultipleSelections: true, options: ['A', 'B'] }],
        values: { kind: ['B', 'A'] },
    }]);
    GM_setValue('vgen-global-presets-v1', [{
        id: 'combination-1', name: 'Combination', title: 'Combined title',
        description: '[{"type":"paragraph","children":[{"text":"combined"}]}]',
        discoverySchema: [{ optionID: 'kind', allowMultipleSelections: false }],
        discoveryValues: { kind: 'A' }, tags: ['tag-b', 'tag-a'],
    }]);
    GM_setValue('vgen-tag-quick-v3-settings', {
        collapsed: true, groupExpanded: { 'group-b': true, 'group-a': false },
        modules: { global: false, title: true, description: false, discovery: true, tags: false },
        autoCollapseDiscovery: false, theme: 'dark',
    });
    document.documentElement.dataset.vgenNyaQuickSeeder = 'complete';
})();
