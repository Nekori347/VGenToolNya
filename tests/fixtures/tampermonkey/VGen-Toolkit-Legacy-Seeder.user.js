// ==UserScript==
// @name         VGen小工具
// @namespace    https://vgen.co/
// @version      0.6.0
// @description  Deployment L2 isolated-profile fixture only.
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_setValue
// ==/UserScript==

(() => {
    'use strict';
    GM_setValue('vgen-toolkit-frequent-clients-v1', [
        {
            id: 'client-2', username: 'second', url: 'https://vgen.co/second', note: 'note',
            userID: 'u2', displayName: 'Second', avatarURL: 'https://example.test/a.png',
            bannerURL: 'https://example.test/b.png', announcementMessage: 'hello',
            announcementModified: '2026-01-01', lastServiceUpdate: '2026-01-02',
            lastPortfolioUpdate: '2026-01-03', serviceFetchFailed: true,
            portfolioFetchFailed: false, profileFetchedAt: 123, createdAt: 100,
        },
        { id: 'client-1', username: 'first', customFutureField: 'preserve' },
    ]);
    GM_setValue('vgen-toolkit-settings-v2', {
        minHeight: 300, rowHeight: 60, collapsed: true,
        keepUnread: true, reactionMarkRead: false,
    });
    document.documentElement.dataset.vgenNyaToolkitSeeder = 'complete';
})();
