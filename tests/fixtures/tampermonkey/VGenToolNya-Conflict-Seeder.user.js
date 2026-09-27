// ==UserScript==
// @name         VGenToolNya Legacy Import
// @namespace    https://vgen.co/
// @version      0.0.9
// @description  Deployment L2 isolated-profile conflict fixture only.
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_setValue
// ==/UserScript==

(() => {
    'use strict';
    GM_setValue('vgen-nya.title-presets.v1', [{
        id: 'existing-new-title', name: 'Existing New', value: 'must not be overwritten',
    }]);
    document.documentElement.dataset.vgenNyaConflictSeeder = 'complete';
})();
