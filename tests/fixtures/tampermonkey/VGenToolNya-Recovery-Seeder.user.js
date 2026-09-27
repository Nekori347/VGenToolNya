// ==UserScript==
// @name         VGenToolNya Legacy Import
// @namespace    https://vgen.co/
// @version      0.0.8
// @description  Deployment L2 isolated-profile interrupted-transaction fixture only.
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_setValue
// ==/UserScript==

(() => {
    'use strict';
    const originalTitle = [{ id: 'before', name: 'Before', value: 'before' }];
    GM_setValue('vgen-nya.title-presets.v1', [{ id: 'partial-title', name: 'Partial', value: 'partial' }]);
    GM_setValue('vgen-nya.description-presets.v1', [{ id: 'partial-description', name: 'Partial', value: 'partial' }]);
    GM_setValue('vgen-nya.migration-staging.v1', {
        kind: 'vgen-nya.legacy-import-journal',
        version: 1,
        transactionId: 'isolated-profile-crash-test',
        createdAt: new Date().toISOString(),
        targets: [
            { key: 'vgen-nya.title-presets.v1', before: { exists: true, value: originalTitle } },
            { key: 'vgen-nya.description-presets.v1', before: { exists: false } },
        ],
    });
    document.documentElement.dataset.vgenNyaRecoverySeeder = 'complete';
})();
