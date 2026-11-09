// ==UserScript==
// @name         VGen 快速标签
// @namespace    https://vgen.co/
// @version      0.9.12
// @description  为 VGen 作品上传窗口提供全局、标题、描述、发现标签与搜索标签预设；各模块可独立启用。
// @author       @Nekori_Net
// @license      MIT
// @match        https://vgen.co/*
// @icon         data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAABwlBMVEUAAAC4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya4/ya5/ya6/yaz9yWr7SS3/Say9iWd2CJdfRl5pR20+iWt7yRPaRcqNBF6ph21+SZ+qx4+UBQ5SRR0nRyy9SVMZBYGAQwXGQ+UzCGTyiESEg4FAAw8ThS0+SVwlxsTEg4IAwwHAgwPDQ1dfBm0+CVYdhgLBw0hJxCb1SKr7CRFWxUiKBBymxy4/Sap6iSw8yWi3yMjKhAJBQ0cIA9DVxUKBw0REQ59qh27/yaq6iR7qB2RxyCv8iWl5CO2+yaMvyAqMxFHXhaGuB8QDg4MCQ1tkxuKvR8YGg8IBAw9TxRulRsJBA1Vchiz9iW7/yeIux8QDw4LCA1liRqRxiAZHA80QhOv8yWk4yMzQBNliBq3+yan5SMpMhEZGw9pjhs4SBMKBg0REA53oh2TySEjKxASEQ5khxp+qh4OCw1SbReHuR8fJBAPDg2SyCBOZxeo5ySIuh8lLREXGA+g3COX0CFBVRUUFA5OaBel4iOFtx9ggRligxmLvh////9rHX7dAAAAGHRSTlMAAAQpbKzZ8v0DN5ff+xqJ6jbC/kIC6d5qsO5oAAAAAWJLR0SVCGB6gwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB+YLExEOIxi1DuQAAAHJSURBVDjLY2CAAkYmZhZWNnYODnY2VhZmJkYGVMDIycXNwysBBbw83FycyEoYGfn4BSRQgAA/HyMjQl5QSFgCDQgLCcJUMDKKsElgAWwiEBVA/VjlgSogZjDyCUngAEJ8QAWMovwSOAG/KCMDI5cYbgViXIwMotwSeAC3KAOzOD4F4swMLLz4FPCyMLBK4AWsDGz4FbAxsINpSWRBCEdSSgpIsjNwgNjSMrJwaSlpGTkpSQlJeQVFJQkJDpACSWUVVTWYGeoamqpa2jqSsrp6+gZSQAVAK6QMjYxNTCUkwWrMzC0sLaysbSRs7ewdpIBWAB0p6ejk7CLh6uYONNjD08vbx9nXzz8gMChYFuRIkDclQ0LDpMIjIgMlA6KiY2Il4+ITEqUlA6TA3gQHFND0gKRku5TUtPSMzKyA7JyE3DxJaEDBgloyv8ArurCouMSrtKy8orJKEhbU8MiSqq7xqq2Trte3a4ixa5SGRxYiuqWamr1adFvbMmMqTNol4dGNlGAkOzq9KvS7MivKu6UQCQY5yUn19Pole/X1T4DKg5McSqKVcp84afIUaWioQhMtSrIHxpCUFCwiRRAZA3/GIZz1CGdefNkfAJLKcIRCxSW2AAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDIyLTExLTE5VDE3OjE0OjM1KzAwOjAwPjphIQAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyMi0xMS0xOVQxNzoxNDozNSswMDowME9n2Z0AAABXelRYdFJhdyBwcm9maWxlIHR5cGUgaXB0YwAAeJzj8gwIcVYoKMpPy8xJ5VIAAyMLLmMLEyMTS5MUAxMgRIA0w2QDI7NUIMvY1MjEzMQcxAfLgEigSi4A6hcRdPJCNZUAAAAASUVORK5CYII=
// @run-at       document-idle
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

(() => {
    'use strict';

    const VERSION = '0.9.12';
    const DATA_KEY = 'vgen-tag-presets-v1';
    const COPY_PRESETS_KEY = 'vgen-copy-presets-v1';
    const DISCOVERY_PRESETS_KEY = 'vgen-discovery-presets-v1';
    const GLOBAL_PRESETS_KEY = 'vgen-global-presets-v1';
    const SETTINGS_KEY = 'vgen-tag-quick-v3-settings';
    const PORTAL_ID = 'vtq-v3-portal';
    const INLINE_HOST_ID = 'vtq-v3-inline-host';
    const COPY_HOST_CLASS = 'vtq-copy-host';
    const GLOBAL_HOST_CLASS = 'vtq-global-host';
    const DISCOVERY_HOST_CLASS = 'vtq-discovery-host';
    const MAX_TAG_LENGTH = 50;
    const SHOWCASE_TAG_LIMIT = 20;
    const DEFAULT_RICH_TEXT = '[{"type":"paragraph","children":[{"text":""}]}]';
    const MODAL_SURFACE_SELECTOR = [
        '.ReactModal__Content[role="dialog"]',
        '.ReactModal__Content',
        '[role="dialog"][aria-modal="true"]',
        '[role="dialog"]',
    ].join(', ');
    const TAG_CONTROL_SELECTOR = [
        'input:not([type])',
        'input[type="text"]',
        'input[type="search"]',
        'textarea',
        '[contenteditable="true"]',
        '[role="combobox"]',
    ].join(', ');
    const pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const translationGuardRoots = new WeakSet();

    function excludeFromTranslation(element) {
        if (!(element instanceof Element)) return element;
        const targets = [element, ...element.querySelectorAll('*')];
        for (const target of targets) {
            if (target.getAttribute('translate') !== 'no') target.setAttribute('translate', 'no');
            if (target.getAttribute('lang') !== 'zh-CN') target.setAttribute('lang', 'zh-CN');
            if (!target.classList.contains('notranslate')) target.classList.add('notranslate');
            if (!target.hasAttribute('data-immersive-translate-walked')) {
                target.setAttribute('data-immersive-translate-walked', '1');
            }
        }
        return element;
    }

    function protectTranslationRoot(root) {
        if (!(root instanceof Element)) return root;
        excludeFromTranslation(root);
        if (translationGuardRoots.has(root)) return root;
        translationGuardRoots.add(root);
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node instanceof Element) excludeFromTranslation(node);
                }
            }
        });
        observer.observe(root, { childList: true, subtree: true });
        return root;
    }

    const DEFAULT_GROUPS = [
        {
            id: makeId(),
            name: '常用类型（示例）',
            tags: ['illustration', 'chibi', 'fanart', 'oc'],
        },
        {
            id: makeId(),
            name: 'VTuber / PNGTuber（示例）',
            tags: ['vtuber', 'pngtuber', 'emotes', 'overlays'],
        },
        {
            id: makeId(),
            name: '动画（示例）',
            tags: ['animation'],
        },
    ];

    let groups = loadGroups();
    let copyPresets = loadCopyPresets();
    let discoveryPresets = loadDiscoveryPresets();
    let globalPresets = loadGlobalPresets();
    let settings = loadSettings();
    let currentInput = null;
    let currentBridge = null;
    let currentTagRoot = null;
    let currentSurface = null;
    let currentTitleContext = null;
    let currentDescriptionContext = null;
    let currentDiscoveryContext = null;
    let currentDiscoverySchema = [];
    let currentShowcaseStore = null;
    let subscribedShowcaseStore = null;
    let showcaseStoreUnsubscribe = null;
    let presetSelectionSyncTimer = 0;
    let busyTag = '';
    let busyCopyKind = '';
    let busyPresetModule = '';
    let editingGroupId = null;
    const editingCopyPresetId = {
        title: null,
        description: null,
    };
    const pendingCopyPresetValue = {
        title: null,
        description: null,
    };
    const pendingCopyPresetPlainText = {
        title: '',
        description: '',
    };
    let editingDiscoveryPresetId = null;
    let editingGlobalPresetId = null;
    let pendingDiscoveryValues = null;
    let pendingGlobalCapture = null;
    let globalEditorDiscoverySchema = [];
    let toastTimer = 0;
    let uploadSurfaceObserver = null;
    let creatorMonitoringActive = false;
    let routeCheckTimer = 0;
    let surfaceDiscoveryTimer = 0;
    let surfaceSequence = 0;
    const surfaceTrackers = new Map();
    const pendingSurfaceRoots = new Set();
    const copyHosts = {
        title: null,
        description: null,
    };
    const presetHostAnchors = new WeakMap();
    const discoveryCollapseSessions = new WeakMap();
    const presetSyncSurfaces = new WeakSet();
    let globalHost = null;
    let currentGlobalPresetContainer = null;
    let discoveryHost = null;
    let overlayGesture = null;

    let portal;
    let panel;
    let panelBody;
    let groupsContainer;
    let statusText;
    let inlineHost;
    let modal;

    injectStyles();
    buildInterface();
    installSiteLifecycle();
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('打开 VGen 快速标签设置', () => openModal('global'));
    }

    function injectStyles() {
        GM_addStyle(`
            #${PORTAL_ID},
            #${PORTAL_ID} *,
            #${INLINE_HOST_ID},
            #${INLINE_HOST_ID} *,
            .${COPY_HOST_CLASS},
            .${COPY_HOST_CLASS} *,
            .${GLOBAL_HOST_CLASS},
            .${GLOBAL_HOST_CLASS} *,
            .${DISCOVERY_HOST_CLASS},
            .${DISCOVERY_HOST_CLASS} * {
                box-sizing: border-box;
            }

            #${PORTAL_ID},
            #${INLINE_HOST_ID},
            .${COPY_HOST_CLASS},
            .${GLOBAL_HOST_CLASS},
            .${DISCOVERY_HOST_CLASS} {
                --vtq-bg: #ffffff;
                --vtq-soft: #f3f6fb;
                --vtq-hover: #e9eef8;
                --vtq-text: #252a37;
                --vtq-muted: #737b8e;
                --vtq-border: rgba(32, 45, 69, 0.15);
                --vtq-shadow: 0 16px 44px rgba(21, 33, 56, 0.19);
                --vtq-blue: #4f7cff;
                --vtq-green: #20cda7;
                --vtq-blue-soft: rgba(79, 124, 255, 0.13);
                --vtq-green-soft: rgba(32, 205, 167, 0.13);
                --vtq-danger: #d84f67;
                --vtq-warn: #d68b27;
                color: var(--vtq-text);
                font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI",
                    "Microsoft YaHei", sans-serif;
            }

            #${PORTAL_ID} {
                position: relative;
                z-index: 2147483000;
            }

            #${PORTAL_ID}[data-theme="dark"],
            #${INLINE_HOST_ID}[data-theme="dark"],
            .${COPY_HOST_CLASS}[data-theme="dark"],
            .${GLOBAL_HOST_CLASS}[data-theme="dark"],
            .${DISCOVERY_HOST_CLASS}[data-theme="dark"] {
                --vtq-bg: #30313f;
                --vtq-soft: #3a3c4a;
                --vtq-hover: #454857;
                --vtq-text: #f2f4f8;
                --vtq-muted: #b7bdca;
                --vtq-border: rgba(255, 255, 255, 0.13);
                --vtq-shadow: 0 18px 48px rgba(0, 0, 0, 0.36);
                --vtq-blue: #7195ff;
                --vtq-green: #3bdfbc;
                --vtq-blue-soft: rgba(113, 149, 255, 0.17);
                --vtq-green-soft: rgba(59, 223, 188, 0.15);
                --vtq-danger: #ff7286;
                --vtq-warn: #f2ad50;
            }

            /* Immersive Translate may ignore translate=no while whole-page bilingual
               mode is active and inject a second text node anyway. Keep the native
               page untouched, but suppress only translations injected into our UI. */
            #${PORTAL_ID} [class*="immersive-translate-target-translation-inline-wrapper"],
            #${PORTAL_ID} [class*="immersive-translate-target-translation-block-wrapper"],
            #${INLINE_HOST_ID} [class*="immersive-translate-target-translation-inline-wrapper"],
            #${INLINE_HOST_ID} [class*="immersive-translate-target-translation-block-wrapper"],
            .${COPY_HOST_CLASS} [class*="immersive-translate-target-translation-inline-wrapper"],
            .${COPY_HOST_CLASS} [class*="immersive-translate-target-translation-block-wrapper"],
            .${GLOBAL_HOST_CLASS} [class*="immersive-translate-target-translation-inline-wrapper"],
            .${GLOBAL_HOST_CLASS} [class*="immersive-translate-target-translation-block-wrapper"],
            .${DISCOVERY_HOST_CLASS} [class*="immersive-translate-target-translation-inline-wrapper"],
            .${DISCOVERY_HOST_CLASS} [class*="immersive-translate-target-translation-block-wrapper"] {
                display: none !important;
            }

            #${PORTAL_ID} .immersive-translate-target-wrapper,
            #${INLINE_HOST_ID} .immersive-translate-target-wrapper,
            .${COPY_HOST_CLASS} .immersive-translate-target-wrapper,
            .${GLOBAL_HOST_CLASS} .immersive-translate-target-wrapper,
            .${DISCOVERY_HOST_CLASS} .immersive-translate-target-wrapper {
                display: contents !important;
            }

            #${INLINE_HOST_ID} {
                width: 100%;
                margin-top: 12px;
                color: var(--vtq-text, inherit);
                font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI",
                    "Microsoft YaHei", sans-serif;
            }

            .${COPY_HOST_CLASS},
            .${GLOBAL_HOST_CLASS},
            .${DISCOVERY_HOST_CLASS} {
                width: 100%;
                color: var(--vtq-text);
                font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI",
                    "Microsoft YaHei", sans-serif;
            }

            .${COPY_HOST_CLASS} {
                margin-top: 2px;
            }

            .${GLOBAL_HOST_CLASS} {
                margin-top: 8px;
            }

            .${DISCOVERY_HOST_CLASS} {
                margin: 4px 0 7px;
            }

            .vtq-hidden {
                display: none !important;
            }

            #${PORTAL_ID} button,
            #${PORTAL_ID} input,
            #${PORTAL_ID} textarea,
            #${INLINE_HOST_ID} button,
            .${COPY_HOST_CLASS} button,
            .${GLOBAL_HOST_CLASS} button,
            .${DISCOVERY_HOST_CLASS} button {
                font: inherit;
            }

            #${PORTAL_ID} button,
            #${INLINE_HOST_ID} button,
            .${COPY_HOST_CLASS} button,
            .${GLOBAL_HOST_CLASS} button,
            .${DISCOVERY_HOST_CLASS} button {
                position: relative;
                z-index: 2;
                pointer-events: auto;
                touch-action: manipulation;
                user-select: none;
            }

            .vtq-panel {
                position: relative;
                width: 100%;
                overflow: hidden;
                border: 1px solid var(--vtq-border);
                border-radius: 14px;
                color: var(--vtq-text);
                background: var(--vtq-bg);
                box-shadow: var(--vtq-shadow);
            }

            .vtq-panel.vtq-inline {
                box-shadow: 0 8px 26px rgba(21, 33, 56, 0.12);
            }

            .vtq-panel::before {
                position: absolute;
                top: 0;
                right: 0;
                left: 0;
                z-index: 1;
                height: 3px;
                background: linear-gradient(90deg, var(--vtq-blue), var(--vtq-green));
                content: "";
            }

            .vtq-header {
                display: flex;
                align-items: center;
                gap: 6px;
                min-height: 34px;
                padding: 5px 7px 4px;
                border-bottom: 1px solid var(--vtq-border);
                user-select: none;
            }

            .vtq-title-block {
                min-width: 0;
                flex: 1;
            }

            .vtq-title-line {
                display: flex;
                align-items: center;
                gap: 7px;
            }

            .vtq-title {
                font-weight: 750;
                font-size: 11px;
                letter-spacing: 0.1px;
            }

            .vtq-version {
                padding: 1px 6px;
                border: 1px solid color-mix(in srgb, var(--vtq-green) 52%, transparent);
                border-radius: 999px;
                color: var(--vtq-green);
                background: var(--vtq-green-soft);
                font-size: 10px;
                font-weight: 700;
            }

            .vtq-header-actions,
            .vtq-row-actions,
            .vtq-form-actions,
            .vtq-position-actions,
            .vtq-manager-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .vtq-header-actions {
                gap: 3px;
            }

            .vtq-icon-button,
            .vtq-small-button,
            .vtq-secondary-button,
            .vtq-primary-button,
            .vtq-danger-button {
                border: 1px solid var(--vtq-border);
                border-radius: 8px;
                color: var(--vtq-text);
                background: var(--vtq-soft);
                cursor: pointer;
            }

            .vtq-icon-button:hover,
            .vtq-small-button:hover,
            .vtq-secondary-button:hover {
                background: var(--vtq-hover);
            }

            .vtq-icon-button {
                min-width: 42px;
                height: 42px;
                padding: 0 13px;
            }

            .vtq-header .vtq-icon-button {
                min-width: 25px;
                width: 25px;
                height: 25px;
                min-height: 25px;
                padding: 0;
                border-radius: 6px;
                font-size: 12px;
            }

            .vtq-open-modal {
                padding: 0;
                font-weight: 650;
            }

            .vtq-small-button {
                min-height: 29px;
                padding: 4px 8px;
                font-size: 12px;
            }

            .vtq-secondary-button,
            .vtq-primary-button,
            .vtq-danger-button {
                min-height: 36px;
                padding: 7px 12px;
            }

            .vtq-primary-button {
                border-color: transparent;
                color: #fff;
                background: linear-gradient(135deg, var(--vtq-blue), var(--vtq-green));
                font-weight: 700;
            }

            .vtq-danger-button {
                border-color: color-mix(in srgb, var(--vtq-danger) 45%, transparent);
                color: var(--vtq-danger);
                background: color-mix(in srgb, var(--vtq-danger) 10%, transparent);
            }

            #${PORTAL_ID} button:disabled,
            #${INLINE_HOST_ID} button:disabled,
            .${COPY_HOST_CLASS} button:disabled,
            .${GLOBAL_HOST_CLASS} button:disabled,
            .${DISCOVERY_HOST_CLASS} button:disabled {
                cursor: not-allowed;
                filter: none;
                opacity: 0.55;
            }

            .vtq-body {
                max-height: min(510px, calc(100vh - 130px));
                overflow: auto;
                padding: 10px;
            }

            .vtq-body.vtq-collapsed {
                display: none;
            }

            .vtq-empty {
                margin: 8px;
                padding: 17px;
                border: 1px dashed var(--vtq-border);
                border-radius: 10px;
                color: var(--vtq-muted);
                text-align: center;
            }

            .vtq-group {
                overflow: hidden;
                margin-bottom: 8px;
                border: 1px solid var(--vtq-border);
                border-radius: 11px;
                background: var(--vtq-soft);
            }

            .vtq-group:last-child {
                margin-bottom: 0;
            }

            .vtq-group-heading {
                position: relative;
                display: flex;
                align-items: center;
                gap: 8px;
                min-height: 40px;
                padding: 7px 9px 9px;
                user-select: none;
            }

            .vtq-group-toggle {
                display: inline-flex;
                min-width: 0;
                min-height: 28px;
                flex: 1;
                align-items: center;
                gap: 8px;
                padding: 0;
                border: 0;
                color: var(--vtq-text);
                background: transparent;
                cursor: pointer;
                text-align: left;
            }

            .vtq-group-chevron {
                color: var(--vtq-muted);
                font-size: 19px;
                line-height: 1;
                transition: transform 0.15s ease;
            }

            .vtq-group[data-expanded="true"] .vtq-group-chevron {
                transform: rotate(90deg);
            }

            .vtq-group-name {
                min-width: 0;
                flex: 1;
                overflow: hidden;
                font-weight: 700;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vtq-group-count {
                color: var(--vtq-muted);
                font-size: 11px;
            }

            .vtq-group-mini-actions {
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .vtq-group[data-expanded="true"] .vtq-group-mini-actions {
                display: none;
            }

            .vtq-group-mini-action {
                display: inline-flex;
                min-width: 25px;
                width: 25px;
                height: 25px;
                min-height: 25px;
                padding: 0;
                border-radius: 7px;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                font-weight: 750;
                line-height: 0;
                text-align: center;
            }

            .vtq-group-content[hidden] {
                display: none;
            }

            .vtq-group-progress {
                position: absolute;
                right: 9px;
                bottom: 3px;
                left: 9px;
                height: 2px;
                overflow: hidden;
                border-radius: 999px;
                background: color-mix(in srgb, var(--vtq-border) 75%, transparent);
            }

            .vtq-group-progress-fill {
                display: block;
                width: 0;
                height: 100%;
                border-radius: inherit;
                background: linear-gradient(90deg, var(--vtq-blue), var(--vtq-green));
                transition: width 0.18s ease;
            }

            .vtq-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 7px;
                padding: 0 10px 10px;
            }

            .vtq-group-toolbar {
                display: flex;
                justify-content: flex-end;
                gap: 6px;
                padding: 0 10px 8px;
            }

            .vtq-group-action {
                min-height: 28px;
                padding: 3px 9px;
                font-size: 11px;
            }

            .vtq-group-add:not(:disabled):hover {
                border-color: var(--vtq-green);
                color: var(--vtq-green);
                background: var(--vtq-green-soft);
            }

            .vtq-group-remove:not(:disabled):hover {
                border-color: var(--vtq-danger);
                color: var(--vtq-danger);
                background: color-mix(in srgb, var(--vtq-danger) 10%, transparent);
            }

            .vtq-copy-strip {
                position: relative;
                overflow: hidden;
                border: 1px solid var(--vtq-border);
                border-radius: 8px;
                color: var(--vtq-text);
                background: var(--vtq-soft);
            }

            .vtq-copy-strip::before {
                position: absolute;
                top: 0;
                right: 0;
                left: 0;
                z-index: 1;
                height: 2px;
                background: linear-gradient(90deg, var(--vtq-blue), var(--vtq-green));
                content: "";
            }

            .vtq-copy-strip-row {
                display: flex;
                align-items: center;
                min-height: 28px;
                padding: 3px 3px 2px 7px;
                gap: 5px;
            }

            .vtq-preset-select {
                min-width: 0;
                height: 23px;
                flex: 1;
                padding: 1px 24px 1px 7px;
                overflow: hidden;
                border: 1px solid var(--vtq-border);
                border-radius: 6px;
                color: var(--vtq-text);
                background: var(--vtq-bg);
                cursor: pointer;
                font: inherit;
                font-size: 11px;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vtq-preset-select:focus {
                border-color: var(--vtq-blue);
                outline: none;
                box-shadow: 0 0 0 2px var(--vtq-blue-soft);
            }

            .vtq-preset-select:disabled {
                cursor: wait;
                opacity: 0.65;
            }

            .${GLOBAL_HOST_CLASS} .vtq-copy-strip-row {
                flex-wrap: wrap;
                min-height: 82px;
                padding: 9px;
                gap: 8px;
            }

            .${GLOBAL_HOST_CLASS} .vtq-global-brand {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 8px;
                padding: 9px 9px 0;
            }

            .${GLOBAL_HOST_CLASS} .vtq-global-plugin-name {
                min-width: 0;
                overflow: hidden;
                font-size: 14px;
                font-weight: 850;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .${GLOBAL_HOST_CLASS} .vtq-global-plugin-meta {
                flex: 0 0 auto;
                color: var(--vtq-muted);
                font-size: 10px;
                white-space: nowrap;
            }

            .${GLOBAL_HOST_CLASS} .vtq-dropdown-label {
                flex: 1;
                font-size: 13px;
            }

            .${GLOBAL_HOST_CLASS} .vtq-preset-select {
                width: 100%;
                height: 36px;
                flex-basis: 100%;
                order: 3;
                padding: 3px 30px 3px 9px;
                font-size: 12px;
            }

            .${GLOBAL_HOST_CLASS} .vtq-copy-strip {
                border-radius: 10px;
            }

            .${GLOBAL_HOST_CLASS} .vtq-copy-strip-actions {
                gap: 5px;
            }

            .${GLOBAL_HOST_CLASS} .vtq-copy-action {
                min-width: 30px;
                width: 30px;
                height: 30px;
                min-height: 30px;
                border-color: var(--vtq-border);
                font-size: 15px;
            }

            .vtq-copy-label {
                font-weight: 700;
                font-size: 11px;
            }

            .vtq-dropdown-label {
                flex: 0 1 auto;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vtq-copy-strip-actions {
                display: flex;
                align-items: center;
                gap: 3px;
            }

            .vtq-copy-action {
                display: inline-flex;
                min-width: 21px;
                width: 21px;
                height: 21px;
                min-height: 21px;
                padding: 0;
                border: 1px solid transparent;
                border-radius: 6px;
                color: var(--vtq-muted);
                background: transparent;
                cursor: pointer;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                line-height: 0;
            }

            .vtq-copy-action:hover {
                border-color: var(--vtq-border);
                color: var(--vtq-blue);
                background: var(--vtq-hover);
            }

            .vtq-tag-button {
                display: inline-flex;
                align-items: center;
                gap: 3px;
                position: relative;
                max-width: 100%;
                min-height: 44px;
                padding: 9px 17px;
                overflow: hidden;
                border: 1px solid color-mix(in srgb, var(--vtq-blue) 44%, var(--vtq-border));
                border-radius: 999px;
                color: var(--vtq-text);
                background: var(--vtq-bg);
                cursor: pointer;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vtq-tag-note {
                font-size: 0.88em;
                opacity: 0.7;
            }

            .vtq-tag-button:active,
            .vtq-tag-button[data-state="pressed"] {
                border-color: var(--vtq-green);
                color: #fff;
                background: var(--vtq-green);
                transform: translateY(1px);
            }

            .vtq-tag-button:hover {
                border-color: color-mix(in srgb, var(--vtq-green) 72%, var(--vtq-blue));
                color: var(--vtq-blue);
                background: linear-gradient(
                    135deg,
                    var(--vtq-blue-soft),
                    var(--vtq-green-soft)
                );
            }

            .vtq-tag-button[data-state="running"] {
                border-color: var(--vtq-green);
                color: #fff;
                background: var(--vtq-green);
                box-shadow: 0 0 0 3px var(--vtq-green-soft);
            }

            .vtq-tag-button[data-state="selected"] {
                border-color: transparent;
                color: #fff;
                background: linear-gradient(135deg, var(--vtq-blue), var(--vtq-green));
                box-shadow: 0 0 0 2px var(--vtq-green-soft);
            }

            .vtq-tag-button[data-state="selected"] .vtq-tag-note {
                opacity: 0.84;
            }

            .vtq-tag-button[data-state="removing"] {
                border-color: var(--vtq-blue);
                color: #fff;
                background: var(--vtq-blue);
                box-shadow: 0 0 0 3px var(--vtq-blue-soft);
            }

            .vtq-tag-button:disabled[data-state="running"],
            .vtq-tag-button:disabled[data-state="removing"],
            .vtq-tag-button:disabled[data-state="selected"] {
                opacity: 1;
            }

            .vtq-tag-button[data-state="failed"] {
                border-color: var(--vtq-warn);
                color: var(--vtq-warn);
                background: color-mix(in srgb, var(--vtq-warn) 12%, transparent);
            }

            .vtq-modal {
                position: fixed;
                inset: 0;
                z-index: 2147483002;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 18px;
                background: rgba(0, 0, 0, 0.5);
            }

            .vtq-modal[data-open="true"] {
                display: flex;
            }

            .vtq-modal-card {
                display: flex;
                width: min(880px, 100%);
                height: min(1080px, calc(100vh - 36px));
                min-height: min(790px, calc(100vh - 36px));
                max-height: calc(100vh - 36px);
                overflow: hidden;
                border: 1px solid var(--vtq-border);
                border-radius: 15px;
                color: var(--vtq-text);
                background: var(--vtq-bg);
                box-shadow: var(--vtq-shadow);
                flex-direction: column;
            }

            .vtq-modal-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 12px 14px;
            }

            .vtq-modal-header {
                border-bottom: 1px solid var(--vtq-border);
            }

            .vtq-modal-brand {
                display: flex;
                min-width: 0;
                align-items: center;
                gap: 9px;
            }

            .vtq-modal-brand-copy {
                display: flex;
                min-width: 0;
                flex-direction: column;
                line-height: 1.25;
            }

            .vtq-modal-brand-title {
                display: flex;
                align-items: center;
                gap: 7px;
                font-size: 14px;
                font-weight: 800;
            }

            .vtq-modal-brand-meta {
                margin-top: 2px;
                color: var(--vtq-muted);
                font-size: 10px;
            }

            .vtq-modal-content {
                display: block;
                min-height: 0;
                flex: 1 1 auto;
                overflow: auto;
                padding: 12px;
            }

            .vtq-settings-accordion {
                overflow: hidden;
                margin-bottom: 9px;
                border: 1px solid var(--vtq-border);
                border-radius: 11px;
                background: var(--vtq-soft);
            }

            .vtq-settings-accordion:last-child {
                margin-bottom: 0;
            }

            .vtq-settings-accordion-header {
                display: flex;
                min-height: 46px;
                align-items: center;
                gap: 8px;
                padding: 6px 9px 6px 12px;
            }

            .vtq-settings-accordion-toggle {
                display: flex;
                min-width: 0;
                min-height: 32px;
                flex: 1;
                align-items: center;
                gap: 8px;
                padding: 0;
                border: 0;
                color: var(--vtq-text);
                background: transparent;
                cursor: pointer;
                text-align: left;
            }

            .vtq-settings-chevron {
                color: var(--vtq-muted);
                font-size: 18px;
                line-height: 1;
                transition: transform 0.15s ease;
            }

            .vtq-settings-accordion[data-open="true"] .vtq-settings-chevron {
                transform: rotate(90deg);
            }

            .vtq-settings-accordion-title {
                font-weight: 800;
            }

            .vtq-settings-accordion-subtitle {
                min-width: 0;
                overflow: hidden;
                color: var(--vtq-muted);
                font-size: 11px;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vtq-module-switch {
                position: relative;
                display: inline-flex;
                align-items: center;
                gap: 7px;
                color: var(--vtq-muted);
                cursor: pointer;
                font-size: 11px;
                user-select: none;
            }

            .vtq-module-switch input {
                position: absolute;
                width: 1px;
                height: 1px;
                overflow: hidden;
                opacity: 0;
                pointer-events: none;
            }

            .vtq-switch-track {
                position: relative;
                display: inline-block;
                width: 36px;
                min-width: 36px;
                height: 20px;
                border: 1px solid var(--vtq-border);
                border-radius: 999px;
                background: color-mix(in srgb, var(--vtq-muted) 22%, var(--vtq-bg));
                transition: border-color .16s ease, background .16s ease;
            }

            .vtq-switch-track::after {
                position: absolute;
                top: 2px;
                left: 2px;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #fff;
                box-shadow: 0 1px 4px rgba(20, 30, 48, .28);
                content: "";
                transition: transform .16s ease;
            }

            .vtq-module-switch input:checked + .vtq-switch-track {
                border-color: transparent;
                background: linear-gradient(135deg, var(--vtq-blue), var(--vtq-green));
            }

            .vtq-module-switch input:checked + .vtq-switch-track::after {
                transform: translateX(16px);
            }

            .vtq-module-switch input:focus-visible + .vtq-switch-track {
                outline: 2px solid var(--vtq-blue);
                outline-offset: 2px;
            }

            .vtq-switch-label {
                white-space: nowrap;
            }

            .vtq-settings-accordion-body {
                padding: 12px;
                border-top: 1px solid var(--vtq-border);
                background: var(--vtq-bg);
            }

            .vtq-settings-accordion-body[hidden] {
                display: none;
            }

            .vtq-settings-two-column {
                display: grid;
                grid-template-columns: minmax(0, 0.9fr) minmax(260px, 1.1fr);
                gap: 12px;
            }

            .vtq-settings-pane {
                min-width: 0;
                padding: 10px;
                border: 1px solid var(--vtq-border);
                border-radius: 9px;
                background: var(--vtq-soft);
            }

            .vtq-settings-pane h4 {
                margin: 0 0 8px;
                font-size: 12px;
            }

            .vtq-native-choice-grid {
                display: grid;
                gap: 9px;
                margin-bottom: 10px;
            }

            .vtq-native-choice-group {
                padding: 8px;
                border: 1px solid var(--vtq-border);
                border-radius: 9px;
                background: var(--vtq-bg);
            }

            .vtq-native-choice-label {
                display: block;
                margin-bottom: 6px;
                font-size: 11px;
                font-weight: 800;
            }

            .vtq-native-choice-options {
                display: flex;
                flex-wrap: wrap;
                gap: 5px;
            }

            .vtq-native-choice {
                display: inline-flex;
                min-height: 28px;
                align-items: center;
                gap: 5px;
                padding: 3px 8px;
                border: 1px solid var(--vtq-border);
                border-radius: 999px;
                background: var(--vtq-soft);
                cursor: pointer;
                font-size: 11px;
            }

            .vtq-native-choice input {
                margin: 0;
                accent-color: var(--vtq-green);
            }

            .vtq-global-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
            }

            .vtq-global-grid .vtq-field-wide,
            .vtq-global-grid .vtq-native-choice-grid {
                grid-column: 1 / -1;
            }

            .vtq-global-source-select {
                margin-bottom: 6px;
            }

            .vtq-title-single-input {
                min-height: 72px;
            }

            .vtq-manager-list,
            .vtq-editor {
                min-width: 0;
                padding: 14px;
            }

            .vtq-manager-list {
                border-right: 1px solid var(--vtq-border);
            }

            .vtq-copy-manager {
                min-width: 0;
                padding: 14px;
                border-top: 1px solid var(--vtq-border);
                grid-column: 1 / -1;
            }

            .vtq-copy-manager-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 12px;
            }

            .vtq-copy-manager-card {
                min-width: 0;
                padding: 10px;
                border: 1px solid var(--vtq-border);
                border-radius: 10px;
                background: var(--vtq-soft);
            }

            .vtq-copy-manager-card h4 {
                margin: 0 0 8px;
                font-size: 12px;
            }

            .vtq-copy-manage-items {
                max-height: 164px;
                margin-bottom: 9px;
                overflow: auto;
            }

            .vtq-copy-manage-item {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 5px;
                padding: 6px 7px;
                border: 1px solid var(--vtq-border);
                border-radius: 8px;
                background: var(--vtq-bg);
            }

            .vtq-copy-manage-text {
                min-width: 0;
                flex: 1;
            }

            .vtq-copy-manage-name,
            .vtq-copy-manage-preview {
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vtq-copy-manage-name {
                font-weight: 700;
            }

            .vtq-copy-manage-preview {
                color: var(--vtq-muted);
                font-size: 10px;
            }

            .vtq-copy-editor-textarea {
                min-height: 72px;
            }

            .vtq-copy-manager-hint {
                margin: 8px 0 0;
                color: var(--vtq-muted);
                font-size: 10px;
            }

            .vtq-title-settings-layout {
                display: grid;
                gap: 10px;
            }

            .vtq-title-settings-layout .vtq-copy-manage-items {
                max-height: 280px;
                margin-bottom: 0;
            }

            .vtq-title-editor {
                display: grid;
                align-items: end;
                gap: 8px;
                padding: 10px;
                border: 1px solid var(--vtq-border);
                border-radius: 9px;
                background: var(--vtq-soft);
                grid-template-columns: minmax(220px, 1.5fr) minmax(150px, 0.8fr) auto;
            }

            .vtq-title-editor .vtq-field {
                margin-bottom: 0;
            }

            .vtq-title-editor .vtq-form-actions {
                min-height: 37px;
                align-items: center;
                flex-wrap: nowrap;
            }

            .vtq-section-title {
                margin: 0 0 9px;
                font-size: 13px;
            }

            .vtq-manage-item {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                padding: 8px;
                border: 1px solid var(--vtq-border);
                border-radius: 9px;
                background: var(--vtq-soft);
            }

            .vtq-manage-item.vtq-dragging {
                border-color: var(--vtq-green);
                box-shadow: 0 8px 22px rgba(21, 33, 56, 0.16);
                opacity: 0.86;
            }

            .vtq-drag-handle {
                display: grid;
                width: 28px;
                min-width: 28px;
                height: 34px;
                padding: 7px 6px;
                border: 0;
                border-radius: 7px;
                color: var(--vtq-muted);
                background: transparent;
                cursor: grab;
                grid-template-columns: repeat(2, 4px);
                grid-template-rows: repeat(3, 4px);
                gap: 3px;
                justify-content: center;
                touch-action: none;
            }

            .vtq-drag-handle:active {
                cursor: grabbing;
                background: var(--vtq-hover);
            }

            .vtq-drag-dot {
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: currentColor;
                pointer-events: none;
            }

            .vtq-item-text {
                min-width: 0;
                flex: 1;
            }

            .vtq-item-name,
            .vtq-item-tags {
                display: block;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .vtq-item-name {
                font-weight: 700;
            }

            .vtq-item-tags {
                color: var(--vtq-muted);
                font-size: 11px;
            }

            .vtq-field {
                display: block;
                margin-bottom: 11px;
            }

            .vtq-field > span {
                display: block;
                margin-bottom: 5px;
                color: var(--vtq-muted);
                font-size: 12px;
            }

            .vtq-input,
            .vtq-textarea {
                width: 100%;
                border: 1px solid var(--vtq-border);
                border-radius: 8px;
                outline: none;
                color: var(--vtq-text);
                background: var(--vtq-soft);
            }

            .vtq-input {
                height: 37px;
                padding: 7px 9px;
            }

            .vtq-textarea {
                min-height: 150px;
                padding: 8px 9px;
                resize: vertical;
            }

            .vtq-input:focus,
            .vtq-textarea:focus {
                border-color: var(--vtq-blue);
                box-shadow: 0 0 0 3px var(--vtq-blue-soft);
            }

            .vtq-hint {
                margin: -5px 0 11px;
                color: var(--vtq-muted);
                font-size: 11px;
            }

            .vtq-form-actions {
                justify-content: flex-end;
                flex-wrap: wrap;
            }

            .vtq-settings-strip {
                display: grid;
                flex: 0 0 auto;
                padding: 12px 14px;
                border-top: 1px solid var(--vtq-border);
                background: var(--vtq-soft);
                grid-template-columns: 1fr;
                gap: 10px;
            }

            .vtq-settings-block-title {
                display: block;
                margin-bottom: 7px;
                font-size: 12px;
                font-weight: 700;
            }

            .vtq-preset-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }

            .vtq-preset-hint {
                display: block;
                margin-top: 6px;
                color: var(--vtq-muted);
                font-size: 11px;
            }

            .vtq-theme-toggle {
                display: inline-flex;
                min-width: 34px;
                width: 34px;
                height: 34px;
                min-height: 34px;
                padding: 0;
                align-items: center;
                justify-content: center;
                border-radius: 9px;
                font-size: 16px;
                line-height: 1;
            }

            .vtq-auto-collapse-setting {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                margin-bottom: 12px;
                padding: 9px 10px;
                border: 1px solid var(--vtq-border);
                border-radius: 9px;
                background: var(--vtq-soft);
            }

            .vtq-auto-collapse-copy {
                min-width: 0;
            }

            .vtq-auto-collapse-title,
            .vtq-auto-collapse-description {
                display: block;
            }

            .vtq-auto-collapse-title {
                font-size: 12px;
                font-weight: 800;
            }

            .vtq-auto-collapse-description {
                margin-top: 2px;
                color: var(--vtq-muted);
                font-size: 10px;
            }

            .vtq-toast {
                position: fixed;
                left: 50%;
                bottom: 28px;
                z-index: 2147483004;
                max-width: min(560px, calc(100vw - 36px));
                padding: 10px 14px;
                border: 1px solid var(--vtq-border);
                border-radius: 10px;
                color: var(--vtq-text);
                background: var(--vtq-bg);
                box-shadow: var(--vtq-shadow);
                opacity: 0;
                pointer-events: none;
                transform: translate(-50%, 12px);
                transition: opacity 0.18s ease, transform 0.18s ease;
            }

            .vtq-toast[data-show="true"] {
                opacity: 1;
                transform: translate(-50%, 0);
            }

            @media (max-width: 650px) {
                .vtq-modal-content {
                    padding: 8px;
                }

                .vtq-copy-manager-grid,
                .vtq-settings-two-column,
                .vtq-global-grid,
                .vtq-title-editor {
                    grid-template-columns: 1fr;
                }

                .vtq-global-grid .vtq-field-wide,
                .vtq-global-grid .vtq-native-choice-grid {
                    grid-column: auto;
                }

                .vtq-manager-list {
                    border-right: 0;
                    border-bottom: 1px solid var(--vtq-border);
                }

                .vtq-settings-strip {
                    grid-template-columns: 1fr;
                }
            }
        `);
    }

    function buildInterface() {
        portal = document.createElement('div');
        portal.id = PORTAL_ID;
        excludeFromTranslation(portal);
        portal.innerHTML = `
            <div class="vtq-modal" role="dialog" aria-modal="true"
                aria-label="快速标签设置">
                <div class="vtq-modal-card">
                    <header class="vtq-modal-header">
                        <div class="vtq-modal-brand">
                            <button class="vtq-secondary-button vtq-theme-toggle" type="button"
                                aria-label="切换日夜模式" title="切换日夜模式">☾</button>
                            <div class="vtq-modal-brand-copy">
                                <div class="vtq-modal-brand-title">
                                    <span>VGen 快速标签</span>
                                    <span class="vtq-version">v${VERSION}</span>
                                </div>
                                <span class="vtq-modal-brand-meta">by @Nekori_Net</span>
                            </div>
                        </div>
                        <div class="vtq-manager-actions">
                            <button class="vtq-icon-button vtq-close-modal" type="button"
                                aria-label="关闭">×</button>
                        </div>
                    </header>

                    <div class="vtq-modal-content">
                        ${settingsAccordionMarkup('global', '全局预设', '一次替换标题、描述、发现标签和搜索标签')}
                        ${settingsAccordionMarkup('title', 'Title 标题', '单一文本预设；按钮文字就是标题内容')}
                        ${settingsAccordionMarkup('description', 'Description 描述', '保存完整描述内容')}
                        ${settingsAccordionMarkup('discovery', 'Discovery tags 发现标签', '保存发现标签组合')}
                        ${settingsAccordionMarkup('tags', 'Search tags 搜索标签', '最多 20 个标签；支持分类批量增删')}
                    </div>

                    <section class="vtq-settings-strip">
                        <div class="vtq-settings-block">
                            <span class="vtq-settings-block-title">预设数据</span>
                            <div class="vtq-preset-actions">
                                <button class="vtq-small-button vtq-export"
                                    type="button">导出</button>
                                <button class="vtq-small-button vtq-import"
                                    type="button">导入</button>
                                <button class="vtq-small-button vtq-reset"
                                    type="button">恢复示例预设</button>
                            </div>
                            <span class="vtq-preset-hint">
                                预设保存在当前浏览器的油猴脚本中
                            </span>
                        </div>
                    </section>
                </div>
            </div>

            <input class="vtq-import-file" type="file"
                accept=".json,application/json" hidden>
            <div class="vtq-toast" role="status"></div>
        `;

        portal.querySelector('[data-settings-section="global"] .vtq-settings-accordion-body').innerHTML = `
            <div class="vtq-settings-two-column">
                <div class="vtq-settings-pane">
                    <h4>已保存全局预设</h4>
                    <div class="vtq-global-manage-items"></div>
                </div>
                <div class="vtq-settings-pane vtq-global-editor">
                    <h4 class="vtq-global-editor-title">新增全局预设</h4>
                    <div class="vtq-global-grid">
                        <label class="vtq-field vtq-field-wide">
                            <span>预设标题</span>
                            <input class="vtq-input vtq-global-name-input" type="text"
                                maxlength="60" placeholder="例如：PNGTuber 默认发布">
                        </label>
                        <label class="vtq-field">
                            <span>Title</span>
                            <select class="vtq-input vtq-global-source-select"
                                data-global-source="title"></select>
                            <textarea class="vtq-textarea vtq-global-title-input vtq-title-single-input"
                                placeholder="完整替换标题"></textarea>
                        </label>
                        <label class="vtq-field">
                            <span>Description</span>
                            <select class="vtq-input vtq-global-source-select"
                                data-global-source="description"></select>
                            <textarea class="vtq-textarea vtq-global-description-input vtq-copy-editor-textarea"
                                placeholder="完整替换描述；支持多行"></textarea>
                        </label>
                        <div class="vtq-field vtq-field-wide">
                            <span>Discovery tags</span>
                            <select class="vtq-input vtq-global-source-select"
                                data-global-source="discovery"></select>
                            <div class="vtq-native-choice-grid vtq-global-discovery-options"></div>
                        </div>
                        <label class="vtq-field vtq-field-wide">
                            <span>Search tags（每行一个）</span>
                            <select class="vtq-input vtq-global-source-select"
                                data-global-source="tags"></select>
                            <textarea class="vtq-textarea vtq-global-tags-input"
                                placeholder="illustration&#10;chibi&#10;vtuber"></textarea>
                        </label>
                    </div>
                    <div class="vtq-form-actions">
                        <button class="vtq-secondary-button vtq-global-cancel-edit"
                            type="button" hidden>取消编辑</button>
                        <button class="vtq-primary-button vtq-global-save"
                            type="button">新增全局预设</button>
                    </div>
                </div>
            </div>`;

        portal.querySelector('[data-settings-section="title"] .vtq-settings-accordion-body').innerHTML = `
            <div class="vtq-title-settings-layout">
                <div class="vtq-settings-pane vtq-copy-manager-card" data-copy-kind="title">
                    <h4>已保存标题</h4>
                    <div class="vtq-copy-manage-items"></div>
                </div>
                <div class="vtq-title-editor" data-copy-kind="title-editor">
                    <label class="vtq-field">
                        <span>标题内容</span>
                        <input class="vtq-input vtq-copy-value-input" type="text"
                            maxlength="180" placeholder="选择预设时只会填入这里的标题">
                    </label>
                    <label class="vtq-field">
                        <span>注释（不会填入 Title）</span>
                        <input class="vtq-input vtq-copy-note-input" type="text"
                            maxlength="80" placeholder="例如：立绘 / 商用稿">
                    </label>
                    <div class="vtq-form-actions">
                        <button class="vtq-secondary-button vtq-copy-cancel-edit"
                            type="button" hidden>取消编辑</button>
                        <button class="vtq-primary-button vtq-copy-save"
                            type="button">新增标题预设</button>
                    </div>
                </div>
            </div>`;

        portal.querySelector('[data-settings-section="description"] .vtq-settings-accordion-body').innerHTML = `
            <div class="vtq-settings-two-column">
                <div class="vtq-settings-pane vtq-copy-manager-card" data-copy-kind="description">
                    <h4>已保存描述</h4>
                    <div class="vtq-copy-manage-items"></div>
                </div>
                <div class="vtq-settings-pane vtq-copy-manager-card" data-copy-kind="description-editor">
                    <h4>新增描述预设</h4>
                    <label class="vtq-field">
                        <span>预设名称</span>
                        <input class="vtq-input vtq-copy-name-input" type="text"
                            maxlength="60" placeholder="例如：常用授权说明">
                    </label>
                    <label class="vtq-field">
                        <span>描述内容</span>
                        <textarea class="vtq-textarea vtq-copy-value-input vtq-copy-editor-textarea"
                            placeholder="完整替换 Description；支持多行"></textarea>
                    </label>
                    <div class="vtq-form-actions">
                        <button class="vtq-secondary-button vtq-copy-cancel-edit"
                            type="button" hidden>取消编辑</button>
                        <button class="vtq-primary-button vtq-copy-save"
                            type="button">新增描述预设</button>
                    </div>
                </div>
            </div>`;

        portal.querySelector('[data-settings-section="discovery"] .vtq-settings-accordion-body').innerHTML = `
            <div class="vtq-auto-collapse-setting">
                <div class="vtq-auto-collapse-copy">
                    <span class="vtq-auto-collapse-title">打开上传窗口时自动收起</span>
                    <span class="vtq-auto-collapse-description">自动收起 VGen 原生的 Style、Technique 与 Vibe</span>
                </div>
                <label class="vtq-module-switch" title="自动收起原生发现标签分组">
                    <input type="checkbox" data-auto-collapse-discovery
                        ${settings.autoCollapseDiscovery ? 'checked' : ''}>
                    <span class="vtq-switch-track" aria-hidden="true"></span>
                    <span class="vtq-switch-label">自动</span>
                </label>
            </div>
            <div class="vtq-settings-two-column">
                <div class="vtq-settings-pane">
                    <h4>已保存发现标签组合</h4>
                    <div class="vtq-discovery-manage-items"></div>
                </div>
                <div class="vtq-settings-pane vtq-discovery-editor">
                    <h4 class="vtq-discovery-editor-title">新增发现标签预设</h4>
                    <label class="vtq-field">
                        <span>预设标题</span>
                        <input class="vtq-input vtq-discovery-name-input" type="text"
                            maxlength="60" placeholder="例如：二次元插画">
                    </label>
                    <div class="vtq-native-choice-grid vtq-discovery-editor-options"></div>
                    <div class="vtq-form-actions">
                        <button class="vtq-secondary-button vtq-discovery-cancel-edit"
                            type="button" hidden>取消编辑</button>
                        <button class="vtq-primary-button vtq-discovery-save"
                            type="button">新增发现标签预设</button>
                    </div>
                </div>
            </div>`;

        portal.querySelector('[data-settings-section="tags"] .vtq-settings-accordion-body').innerHTML = `
            <div class="vtq-settings-two-column">
                <section class="vtq-settings-pane">
                    <h4>已保存分类 / 情景</h4>
                    <div class="vtq-manage-items"></div>
                </section>
                <section class="vtq-settings-pane vtq-editor">
                    <h4 class="vtq-editor-title">新增分类 / 情景</h4>
                    <label class="vtq-field">
                        <span>名称</span>
                        <input class="vtq-input vtq-name-input" type="text"
                            maxlength="50" placeholder="例如：PNGTuber YCH">
                    </label>
                    <label class="vtq-field">
                        <span>标签按钮</span>
                        <textarea class="vtq-textarea vtq-tags-input"
                            placeholder="例如：illustration【插画】&#10;live2d rigging【Live2D 骨骼绑定】"></textarea>
                    </label>
                    <p class="vtq-hint">每行一个标签；【中文备注】只显示，不会发送给 VGen。</p>
                    <div class="vtq-form-actions">
                        <button class="vtq-secondary-button vtq-cancel-edit"
                            type="button" hidden>取消编辑</button>
                        <button class="vtq-primary-button vtq-save-group"
                            type="button">新增</button>
                    </div>
                </section>
            </div>`;

        panel = document.createElement('section');
        panel.className = 'vtq-panel';
        excludeFromTranslation(panel);
        panel.hidden = true;
        panel.innerHTML = `
            <header class="vtq-header">
                <div class="vtq-title-block">
                    <div class="vtq-title-line">
                        <span class="vtq-title">Search tags</span>
                    </div>
                </div>
                <div class="vtq-header-actions">
                    <button class="vtq-icon-button vtq-open-modal" type="button"
                        title="设置" aria-label="设置">⚙</button>
                    <button class="vtq-icon-button vtq-collapse" type="button"
                        title="折叠或展开">−</button>
                </div>
            </header>
            <div class="vtq-body"></div>
        `;

        protectTranslationRoot(portal);
        protectTranslationRoot(panel);
        document.body.appendChild(portal);
        modal = portal.querySelector('.vtq-modal');
        panelBody = panel.querySelector('.vtq-body');
        groupsContainer = panelBody;
        statusText = null;

        bindInterfaceEvents();
        renderGroups();
        renderManager();
        renderGlobalSourceSelectors();
    }

    function settingsAccordionMarkup(kind, title, subtitle) {
        const enabled = settings.modules?.[kind] !== false;
        return `
            <section class="vtq-settings-accordion" data-settings-section="${kind}" data-open="false">
                <header class="vtq-settings-accordion-header">
                    <button class="vtq-settings-accordion-toggle" type="button" aria-expanded="false">
                        <span class="vtq-settings-chevron">›</span>
                        <span class="vtq-settings-accordion-title">${title}</span>
                        <span class="vtq-settings-accordion-subtitle">${subtitle}</span>
                    </button>
                    <label class="vtq-module-switch" title="独立启用或停用此模块">
                        <input type="checkbox" data-module="${kind}" ${enabled ? 'checked' : ''}>
                        <span class="vtq-switch-track" aria-hidden="true"></span>
                        <span class="vtq-switch-label">启用</span>
                    </label>
                </header>
                <div class="vtq-settings-accordion-body" hidden></div>
            </section>`;
    }

    function bindInterfaceEvents() {
        bindImmediateAction(panel.querySelector('.vtq-open-modal'), () => openModal('tags'));
        bindImmediateAction(panel.querySelector('.vtq-collapse'), (event) => {
            settings.collapsed = !settings.collapsed;
            saveSettings();
            panelBody.classList.toggle('vtq-collapsed', settings.collapsed);
            event.currentTarget.textContent = settings.collapsed ? '+' : '−';
        });

        portal.querySelector('.vtq-close-modal').addEventListener('click', closeModal);
        modal.addEventListener('pointerdown', (event) => {
            if (event.target !== modal || event.button !== 0) {
                overlayGesture = null;
                return;
            }
            overlayGesture = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
            };
        });
        modal.addEventListener('pointerup', (event) => {
            const gesture = overlayGesture;
            overlayGesture = null;
            if (
                !gesture
                || event.target !== modal
                || event.pointerId !== gesture.pointerId
                || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5
                || !window.getSelection?.().isCollapsed
            ) {
                return;
            }
            closeModal();
        });

        for (const section of portal.querySelectorAll('.vtq-settings-accordion')) {
            section.querySelector('.vtq-settings-accordion-toggle').addEventListener(
                'click',
                () => setSettingsSectionOpen(
                    section.dataset.settingsSection,
                    section.dataset.open !== 'true',
                ),
            );
        }
        for (const input of portal.querySelectorAll('[data-module]')) {
            input.addEventListener('change', () => {
                settings.modules[input.dataset.module] = input.checked;
                saveSettings();
                refreshEnabledModules();
            });
        }
        const autoCollapseDiscovery = portal.querySelector('[data-auto-collapse-discovery]');
        autoCollapseDiscovery.addEventListener('change', () => {
            settings.autoCollapseDiscovery = autoCollapseDiscovery.checked;
            saveSettings();
            stopDiscoveryOptionCollapse(currentSurface);
            if (settings.autoCollapseDiscovery && currentSurface?.isConnected) {
                startDiscoveryOptionCollapse(currentSurface, currentDiscoveryContext);
            }
        });

        portal.querySelector('.vtq-save-group').addEventListener('click', saveEditedGroup);
        portal.querySelector('.vtq-cancel-edit').addEventListener('click', resetEditor);
        portal.querySelector('.vtq-reset').addEventListener('click', resetGroups);
        portal.querySelector('.vtq-export').addEventListener('click', exportGroups);
        portal.querySelector('.vtq-import').addEventListener('click', () => {
            portal.querySelector('.vtq-import-file').click();
        });
        portal.querySelector('.vtq-import-file').addEventListener('change', importGroups);
        portal.querySelector('.vtq-theme-toggle').addEventListener('click', toggleTheme);

        for (const kind of ['title', 'description']) {
            const section = portal.querySelector(`[data-settings-section="${kind}"]`);
            section.querySelector('.vtq-copy-save').addEventListener(
                'click', () => saveCopyPresetFromManager(kind),
            );
            section.querySelector('.vtq-copy-cancel-edit').addEventListener(
                'click', () => resetCopyPresetEditor(kind),
            );
        }

        portal.querySelector('.vtq-discovery-save').addEventListener(
            'click', saveDiscoveryPresetFromManager,
        );
        portal.querySelector('.vtq-discovery-cancel-edit').addEventListener(
            'click', resetDiscoveryPresetEditor,
        );
        portal.querySelector('.vtq-global-save').addEventListener(
            'click', saveGlobalPresetFromManager,
        );
        portal.querySelector('.vtq-global-cancel-edit').addEventListener(
            'click', resetGlobalPresetEditor,
        );
        for (const select of portal.querySelectorAll('[data-global-source]')) {
            select.addEventListener('change', () => applyGlobalSourcePreset(select));
        }
        const globalEditor = portal.querySelector('.vtq-global-editor');
        globalEditor.addEventListener('input', (event) => {
            if (!event.target.matches('[data-global-source]')) syncGlobalSourceSelections();
        });
        globalEditor.addEventListener('change', (event) => {
            if (!event.target.matches('[data-global-source]')) syncGlobalSourceSelections();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.dataset.open === 'true') closeModal();
        });

        installManagerDragging();
        panelBody.classList.toggle('vtq-collapsed', settings.collapsed);
        panel.querySelector('.vtq-collapse').textContent = settings.collapsed ? '+' : '−';
        applyThemeMode();
        renderAllManagers();
        refreshEnabledModules();
    }

    function installSiteLifecycle() {
        // 油猴只会根据“本次文档最初加载时的地址”决定是否注入脚本。
        // 因此脚本必须覆盖整个 vgen.co，再在 VGen 的 SPA 路由进入 creator 后启用监听。
        for (const methodName of ['pushState', 'replaceState']) {
            const original = pageWindow.history?.[methodName];
            if (typeof original !== 'function') continue;
            try {
                pageWindow.history[methodName] = function (...args) {
                    const result = original.apply(this, args);
                    window.setTimeout(syncCreatorMonitoring, 0);
                    return result;
                };
            } catch {
                // 若页面禁止改写 History，下面的低频地址检查仍会接管。
            }
        }

        pageWindow.addEventListener?.('popstate', syncCreatorMonitoring);
        pageWindow.addEventListener?.('hashchange', syncCreatorMonitoring);
        routeCheckTimer = window.setInterval(syncCreatorMonitoring, 1200);
        syncCreatorMonitoring();
    }

    function isCreatorRoute() {
        const pathname = pageWindow.location?.pathname || location.pathname;
        return pathname === '/creator' || pathname.startsWith('/creator/');
    }

    function syncCreatorMonitoring() {
        if (isCreatorRoute()) {
            startCreatorMonitoring();
        } else {
            stopCreatorMonitoring();
        }
    }

    function startCreatorMonitoring() {
        if (creatorMonitoringActive) return;
        creatorMonitoringActive = true;

        uploadSurfaceObserver = new MutationObserver(handleUploadSurfaceMutations);
        uploadSurfaceObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // 当前 ShowcaseModal 在 isOpen 时挂载、关闭时卸载。进入 creator 路由只需
        // 扫描一次已有弹窗；之后由 childList 生命周期接管，不观察布局与动画属性。
        discoverUploadSurfaces(document);
    }

    function stopCreatorMonitoring() {
        if (!creatorMonitoringActive) return;
        creatorMonitoringActive = false;
        uploadSurfaceObserver?.disconnect();
        uploadSurfaceObserver = null;
        window.clearTimeout(surfaceDiscoveryTimer);
        surfaceDiscoveryTimer = 0;
        pendingSurfaceRoots.clear();

        for (const tracker of surfaceTrackers.values()) {
            window.clearTimeout(tracker.timer);
        }
        surfaceTrackers.clear();
        resetNativeConnection();
    }

    function handleUploadSurfaceMutations(records) {
        if (!creatorMonitoringActive) return;

        for (const record of records) {
            const target = record.target instanceof Element
                ? record.target
                : record.target.parentElement;
            if (isToolElement(target)) continue;

            const addedElement = [...record.addedNodes].find((node) =>
                node instanceof Element && !isToolElement(node),
            );
            if (addedElement) {
                // React 同一提交批次可能逐个追加数百个兄弟节点。按共同父容器
                // 合并后只做一次 querySelectorAll，而不是为每个子节点建任务。
                queueSurfaceDiscovery(target || addedElement);
            }

            if (
                currentInput
                && [...record.removedNodes].some((node) =>
                    node === currentInput
                    || node === currentSurface
                    || node.contains?.(currentInput)
                    || node.contains?.(currentSurface),
                )
            ) {
                resetNativeConnection();
                continue;
            }

            // 仅在上传表单仍处于首次挂载、接口尚未齐全时响应内部新增节点。
            // 已连接完成的窗口不再因媒体预览、动画或插件 UI 变化而重扫。
            if (currentSurface && target && currentSurface.contains(target)) {
                const tracker = surfaceTrackers.get(currentSurface);
                if (tracker && (!tracker.connected || tracker.incomplete)) {
                    scheduleSurfaceProbe(tracker, 0);
                }
            }
        }

        if (
            currentSurface
            && (!currentSurface.isConnected || !isSurfaceOpen(currentSurface))
        ) {
            resetNativeConnection();
        }

        removeDisconnectedSurfaceTrackers();
    }

    function queueSurfaceDiscovery(root) {
        if (!(root instanceof Element) || !root.isConnected) return;
        pendingSurfaceRoots.add(root);
        if (surfaceDiscoveryTimer) return;
        surfaceDiscoveryTimer = window.setTimeout(flushSurfaceDiscovery, 0);
    }

    function flushSurfaceDiscovery() {
        surfaceDiscoveryTimer = 0;
        const roots = [...pendingSurfaceRoots].filter((root) => root.isConnected);
        pendingSurfaceRoots.clear();
        const topLevelRoots = roots.filter((root, index) => !roots.some((other, otherIndex) =>
            otherIndex !== index && other.contains(root),
        ));
        for (const root of topLevelRoots) discoverUploadSurfaces(root);
    }

    function discoverUploadSurfaces(root) {
        const surfaces = [];
        if (root === document) {
            surfaces.push(...document.querySelectorAll(MODAL_SURFACE_SELECTOR));
        } else if (root instanceof Element) {
            if (root.matches(MODAL_SURFACE_SELECTOR)) surfaces.push(root);
            surfaces.push(...root.querySelectorAll(MODAL_SURFACE_SELECTOR));
            const closest = findModalSurface(root);
            if (closest) surfaces.push(closest);
        }

        for (const surface of new Set(surfaces)) {
            registerUploadSurface(surface);
        }
    }

    function registerUploadSurface(surface) {
        if (
            !(surface instanceof Element)
            || isToolElement(surface)
            || !surface.isConnected
        ) {
            return;
        }

        let tracker = surfaceTrackers.get(surface);
        if (!tracker) {
            tracker = {
                surface,
                sequence: 0,
                attempt: 0,
                timer: 0,
                wasOpen: false,
                openedAt: 0,
                connected: false,
                incomplete: true,
                settleAttempts: 0,
            };
            surfaceTrackers.set(surface, tracker);
        }

        if (!isSurfaceOpen(surface)) {
            window.clearTimeout(tracker.timer);
            tracker.timer = 0;
            tracker.attempt = 0;
            tracker.wasOpen = false;
            tracker.connected = false;
            tracker.incomplete = true;
            tracker.settleAttempts = 0;
            if (currentSurface === surface) resetNativeConnection();
            return;
        }

        if (!tracker.wasOpen) {
            tracker.wasOpen = true;
            tracker.openedAt = Date.now();
            tracker.sequence = ++surfaceSequence;
            tracker.connected = false;
            tracker.incomplete = true;
            tracker.settleAttempts = 0;
        }

        if (tracker.connected && !tracker.incomplete) return;
        scheduleSurfaceProbe(tracker, 0);
    }

    function scheduleSurfaceProbe(tracker, delay) {
        if (!tracker?.surface?.isConnected) return;
        window.clearTimeout(tracker.timer);
        tracker.timer = window.setTimeout(() => probeUploadSurface(tracker), delay);
    }

    function probeUploadSurface(tracker) {
        tracker.timer = 0;
        const { surface } = tracker;

        if (!surface.isConnected) {
            surfaceTrackers.delete(surface);
            if (currentSurface === surface) resetNativeConnection();
            return;
        }
        if (!isSurfaceOpen(surface)) {
            tracker.attempt = 0;
            if (currentSurface === surface) resetNativeConnection();
            return;
        }

        const context = findShowcaseContext(surface);
        if (context) {
            tracker.attempt = 0;
            tracker.connected = true;
            tracker.incomplete = !(
                context.title && context.description && context.discovery
            );
            if (shouldUseSurface(surface)) connectNativeContext(context, surface);

            // Shadow DOM 编辑器可能比弹窗主体晚一个提交批次挂载。仅在字段尚不
            // 完整时做有上限的挂载收尾；接口齐全后彻底停止扫描。
            if (tracker.incomplete && tracker.settleAttempts < 4) {
                tracker.settleAttempts += 1;
                scheduleSurfaceProbe(tracker, 40 * tracker.settleAttempts);
            }
            return;
        }

        const tagControls = findPotentialTagControls(surface);
        const readyBridges = tagControls
            .map((control) => findTagSearchBridge(control))
            .filter(Boolean);

        // 该弹窗已经明确挂载了另一种 TagSearch（例如作品批量标签编辑），
        // 它不是上传表单，不继续轮询；若结构再变化，MutationObserver 会重新唤醒。
        if (readyBridges.length > 0 && readyBridges.every((bridge) => !isUploadTagBridge(bridge))) {
            tracker.attempt = 0;
            return;
        }

        // 普通弹窗没有标签控件时只在刚唤起阶段短暂等待懒加载；
        // 真正出现标签输入框后会继续等待 React 回调，不设入口路径或固定 4.2 秒窗口。
        if (!tagControls.length && Date.now() - tracker.openedAt > 9000) {
            tracker.attempt = 0;
            return;
        }

        tracker.attempt += 1;
        const delay = Math.min(1400, 45 * (1.55 ** Math.min(tracker.attempt, 8)));
        scheduleSurfaceProbe(tracker, Math.round(delay));
    }

    function connectNativeContext(context, surface) {
        const found = context?.input || null;
        if (!found || !context.bridge || !surface?.isConnected) return;

        if (found !== currentInput) {
            currentInput = found;
        }

        currentBridge = context.bridge;
        currentTagRoot = context.root;
        currentSurface = surface;
        currentTitleContext = context.title;
        currentDescriptionContext = context.description;
        currentDiscoveryContext = context.discovery;
        currentShowcaseStore = context.store || null;
        bindShowcaseStore(currentShowcaseStore);
        bindSurfacePresetSync(surface);
        if (context.discovery?.schema?.length) {
            currentDiscoverySchema = normalizeDiscoverySchema(context.discovery.schema);
        }
        startDiscoveryOptionCollapse(surface, context.discovery);
        refreshEnabledModules();
        syncTagButtonStates();
    }

    // Showcase 上传器并不使用通用 Accordion。当前 VGen 的真实链路是：
    // ShowcaseOptionsForm -> ShowcaseOption -> ExpandableSection。发现标签的每个
    // option fiber 都能直接找到自己唯一的 ExpandableSection，因此折叠不再依赖
    // 标题文本、分组顺序或页面 class 穷举，而是调用该组件根节点的 React onClick。
    function startDiscoveryOptionCollapse(surface, discoveryContext) {
        if (
            !settings.modules.discovery
            || !settings.autoCollapseDiscovery
            || !surface?.isConnected
            || !isSurfaceOpen(surface)
        ) {
            stopDiscoveryOptionCollapse(surface);
            return;
        }

        const sequence = surfaceTrackers.get(surface)?.sequence || 0;
        let session = discoveryCollapseSessions.get(surface);
        if (!session || session.sequence !== sequence) {
            stopDiscoveryOptionCollapse(surface);
            session = {
                sequence,
                context: discoveryContext || null,
                observer: null,
                observedRoot: null,
                scheduled: false,
                completed: false,
            };
            discoveryCollapseSessions.set(surface, session);
        } else if (discoveryContext) {
            session.context = discoveryContext;
        }

        observeDiscoveryOptionLifecycle(surface, session);
        scheduleDiscoveryOptionReconcile(surface, session);
    }

    function stopDiscoveryOptionCollapse(surface) {
        if (!surface) return;
        const session = discoveryCollapseSessions.get(surface);
        session?.observer?.disconnect();
        discoveryCollapseSessions.delete(surface);
    }

    function observeDiscoveryOptionLifecycle(surface, session, preferredRoot = null) {
        if (session.completed) return;
        const root = preferredRoot
            || session.context?.root
            || surface;
        if (!root?.isConnected || session.observedRoot === root) return;

        session.observer?.disconnect();
        session.observer = new MutationObserver(() => {
            scheduleDiscoveryOptionReconcile(surface, session);
        });
        session.observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            // ExpandableSection 的真实开合结果由 aria-hidden 表示。排除 class/style
            // 后，收起动画不会再逐帧触发 React Fiber 扫描。
            attributeFilter: ['aria-hidden'],
        });
        session.observedRoot = root;
    }

    function scheduleDiscoveryOptionReconcile(surface, session) {
        if (session.scheduled || session.completed) return;
        session.scheduled = true;
        const reconcile = () => {
            session.scheduled = false;
            reconcileDiscoveryOptions(surface, session);
        };
        if (typeof pageWindow.queueMicrotask === 'function') {
            pageWindow.queueMicrotask(reconcile);
        } else {
            Promise.resolve().then(reconcile);
        }
    }

    function reconcileDiscoveryOptions(surface, session) {
        if (
            discoveryCollapseSessions.get(surface) !== session
            || session.completed
            || !settings.modules.discovery
            || !settings.autoCollapseDiscovery
            || !surface?.isConnected
            || !isSurfaceOpen(surface)
        ) {
            return;
        }

        const liveContext = refreshKnownDiscoveryContext(session.context, surface)
            || session.context;
        if (liveContext) {
            session.context = liveContext;
            if (currentSurface === surface) currentDiscoveryContext = liveContext;
        }
        const bindings = liveContext?.optionBindings || [];
        if (!bindings.length) return;

        let allCollapsed = true;
        for (const binding of bindings) {
            const disclosure = findShowcaseOptionDisclosure(binding, surface);
            if (!disclosure) {
                allCollapsed = false;
                continue;
            }

            if (disclosure.isOpen === true) {
                disclosure.collapse();
                allCollapsed = false;
                continue;
            }
            if (readExpandableSectionDomOpen(disclosure.root) === true) allCollapsed = false;
        }

        const expectedCount = normalizeDiscoverySchema(liveContext?.schema).length;
        if (allCollapsed && bindings.length >= Math.max(1, expectedCount)) {
            session.completed = true;
            session.observer?.disconnect();
            return;
        }

        // ExpandableSection 更新后会改变内容区的 aria-hidden；会话观察器会据此
        // 安排一次结果核验。这里不再逐帧主动重扫三个 React 子树。
    }

    function findShowcaseOptionDisclosure(binding, surface = currentSurface) {
        const rootFiber = binding?.fiber;
        if (!rootFiber) return null;
        let best = null;

        for (const fiber of walkFiberSubtree(rootFiber, 220)) {
            for (const candidate of [fiber, fiber?.alternate]) {
                if (!candidate) continue;
                const props = candidate.memoizedProps || candidate.pendingProps;
                if (!isShowcaseExpandableSectionProps(props)) continue;
                const hooks = reactStateHooks(candidate);
                const openHook = hooks.find((hook) => typeof hook.memoizedState === 'boolean');
                if (!openHook) continue;
                const root = findExpandableSectionRoot(candidate, surface);
                if (!root) continue;
                const domOpen = readExpandableSectionDomOpen(root);

                const bridge = {
                    fiber: candidate,
                    props,
                    root,
                    hook: openHook,
                    isOpen: openHook.memoizedState === true,
                    collapse() {
                        if (openHook.memoizedState !== true) return;
                        const elementProps = getReactProps(root);
                        if (typeof elementProps?.onClick === 'function') {
                            elementProps.onClick();
                            return;
                        }
                        openHook.queue.dispatch(false);
                        props.onClickExpand(false);
                    },
                };
                const score = (bridge.isOpen === domOpen ? 10 : 0)
                    + (props.titleClassName === 'showcaseOptionTitle' ? 4 : 0)
                    + (candidate.memoizedProps ? 1 : 0);
                if (!best || score > best.score) best = { ...bridge, score };
            }
        }
        return best;
    }

    function isShowcaseExpandableSectionProps(props) {
        if (!props || typeof props !== 'object') return false;
        const hasOwn = (key) => Object.prototype.hasOwnProperty.call(props, key);
        return hasOwn('isDefaultHidden')
            && hasOwn('onClickExpand')
            && hasOwn('isAnimated')
            && typeof props.onClickExpand === 'function';
    }

    function findExpandableSectionRoot(fiber, surface) {
        const hosts = componentHostElements(fiber, surface, 160);
        return hosts.find((element) => {
            const directContent = [...(element.children || [])].find((child) =>
                child.hasAttribute?.('aria-hidden'),
            );
            return directContent && typeof getReactProps(element)?.onClick === 'function';
        }) || hosts.find((element) => [...(element.children || [])].some((child) =>
            child.hasAttribute?.('aria-hidden'),
        )) || null;
    }

    function reactStateHooks(fiber) {
        const hooks = [];
        const seen = new Set();
        let hook = fiber?.memoizedState || null;
        while (hook && hooks.length < 8 && !seen.has(hook)) {
            seen.add(hook);
            if (hook.queue && typeof hook.queue.dispatch === 'function') hooks.push(hook);
            hook = hook.next;
        }
        return hooks;
    }

    function smallestCommonElement(elements, boundary) {
        const connected = elements.filter((element) => element?.isConnected);
        if (!connected.length) return null;
        let candidate = connected[0].parentElement;
        while (
            candidate
            && candidate !== boundary
            && !connected.every((element) => candidate.contains(element))
        ) {
            candidate = candidate.parentElement;
        }
        return candidate && isWithinComposedTree(candidate, boundary) ? candidate : boundary;
    }

    function readExpandableSectionDomOpen(root) {
        if (!root) return null;
        const content = [...(root.children || [])].find((element) =>
            element.hasAttribute?.('aria-hidden'),
        );
        const aria = content?.getAttribute('aria-hidden');
        if (aria === 'true') return false;
        if (aria === 'false') return true;

        const icon = root.querySelector?.('.directionIcon');
        const transform = String(icon?.style?.transform || '').toLocaleLowerCase();
        if (transform.includes('180deg')) return true;
        if (transform === 'initial' || transform === 'none') return false;
        return null;
    }

    function resetNativeConnection() {
        const previousSurface = currentSurface;
        const previousTracker = surfaceTrackers.get(previousSurface);
        if (previousTracker) {
            previousTracker.connected = false;
            previousTracker.incomplete = true;
            previousTracker.settleAttempts = 0;
        }
        stopDiscoveryOptionCollapse(currentSurface);
        currentInput = null;
        currentBridge = null;
        currentTagRoot = null;
        currentSurface = null;
        currentTitleContext = null;
        currentDescriptionContext = null;
        currentDiscoveryContext = null;
        currentDiscoverySchema = [];
        currentGlobalPresetContainer = null;
        bindShowcaseStore(null);
        window.clearTimeout(presetSelectionSyncTimer);
        presetSelectionSyncTimer = 0;
        currentShowcaseStore = null;
        panel.hidden = true;
        inlineHost?.remove();
        inlineHost = null;
        removeAllPresetBars();
    }

    function bindShowcaseStore(store) {
        if (store === subscribedShowcaseStore) return;
        if (typeof showcaseStoreUnsubscribe === 'function') {
            try { showcaseStoreUnsubscribe(); } catch { /* store was already disposed */ }
        }
        subscribedShowcaseStore = store || null;
        showcaseStoreUnsubscribe = null;
        if (store && typeof store.subscribe === 'function') {
            showcaseStoreUnsubscribe = store.subscribe(() => schedulePresetSelectionSync(25));
        }
    }

    function bindSurfacePresetSync(surface) {
        if (!surface || presetSyncSurfaces.has(surface)) return;
        presetSyncSurfaces.add(surface);
        const scheduleFromNativeEdit = (event) => {
            if (!isToolElement(event.target)) schedulePresetSelectionSync(45);
        };
        surface.addEventListener('input', scheduleFromNativeEdit, true);
        surface.addEventListener('change', scheduleFromNativeEdit, true);
        // VGen 的 RadioButton / Checkbox 是自定义 React 控件，不保证派发原生
        // input/change；click 后重新读取 ShowcaseOptionsForm 的最新 props。
        surface.addEventListener('click', scheduleFromNativeEdit, true);
        surface.addEventListener('keyup', scheduleFromNativeEdit, true);
        surface.addEventListener('focusout', scheduleFromNativeEdit, true);
    }

    function schedulePresetSelectionSync(delay = 0) {
        window.clearTimeout(presetSelectionSyncTimer);
        presetSelectionSyncTimer = window.setTimeout(syncPresetSelections, delay);
    }

    function syncPresetSelections() {
        presetSelectionSyncTimer = 0;
        if (!currentSurface?.isConnected || !isSurfaceOpen(currentSurface)) return;
        if (busyPresetModule || busyCopyKind || busyTag) {
            schedulePresetSelectionSync(90);
            return;
        }
        refreshCurrentTagBridge();
        const discoveryValues = readCurrentDiscoveryValues(true);
        renderCopyPresetBars();
        if (globalHost?.isConnected) renderGlobalPresetBar(false, discoveryValues);
        if (discoveryHost?.isConnected) renderDiscoveryPresetBar(false, discoveryValues);
        syncTagButtonStates();
    }

    function refreshCurrentTagBridge() {
        if (!currentInput?.isConnected) return null;
        const bridge = findTagSearchBridge(currentInput);
        if (!isUploadTagBridge(bridge)) return null;
        currentBridge = bridge;
        return bridge;
    }

    function removeDisconnectedSurfaceTrackers() {
        for (const [surface, tracker] of surfaceTrackers) {
            if (surface.isConnected) continue;
            window.clearTimeout(tracker.timer);
            surfaceTrackers.delete(surface);
        }
    }

    function findModalSurface(element) {
        const surface = element?.closest?.(MODAL_SURFACE_SELECTOR) || null;
        return surface && !isToolElement(surface) ? surface : null;
    }

    function looksLikeTagControl(element) {
        const description = [
            element.getAttribute('placeholder'),
            element.getAttribute('data-placeholder'),
            element.getAttribute('aria-label'),
        ].filter(Boolean).join(' ');
        return /add\s*tags?|search\s*tags?|添加标签|搜索标签/i.test(description)
            || isUploadTagBridge(findTagSearchBridge(element));
    }

    function findPotentialTagControls(scope) {
        const controls = [
            ...(scope.matches?.(TAG_CONTROL_SELECTOR) ? [scope] : []),
            ...scope.querySelectorAll(TAG_CONTROL_SELECTOR),
        ];
        return controls.filter((control) =>
            !isToolElement(control) && looksLikeTagControl(control),
        );
    }

    function isUploadTagBridge(bridge) {
        if (!bridge) return false;
        const props = bridge.props || {};
        const tagLimit = Number(bridge.tagLimit);

        // 这里只做已知黑名单排除，不再要求同时命中作品上传器的全部特征。
        // 橱窗 / Commission Service 的标签上限是 5；作品批量编辑则明确关闭
        // showSelectedTags。其余可交互 TagSearch 先允许连接，再由所在弹窗生命周期约束。
        return tagLimit !== 5
            && props.isDisplayOnly !== true
            && props.showSelectedTags !== false;
    }

    function isSurfaceOpen(surface) {
        if (!(surface instanceof Element) || !surface.isConnected) return false;
        let node = surface;
        while (node && node !== document.documentElement) {
            if (
                node.hidden
                || node.getAttribute('aria-hidden') === 'true'
                || node.getAttribute('data-state') === 'closed'
            ) {
                return false;
            }
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            node = node.parentElement;
        }
        return true;
    }

    function shouldUseSurface(surface) {
        if (
            !currentSurface
            || currentSurface === surface
            || !currentSurface.isConnected
            || !isSurfaceOpen(currentSurface)
        ) {
            return true;
        }

        const currentTracker = surfaceTrackers.get(currentSurface);
        const nextTracker = surfaceTrackers.get(surface);
        return (nextTracker?.sequence || 0) >= (currentTracker?.sequence || 0);
    }

    function isToolElement(element) {
        return Boolean(element?.closest?.([
            `#${PORTAL_ID}`,
            `#${INLINE_HOST_ID}`,
            `.${COPY_HOST_CLASS}`,
            `.${GLOBAL_HOST_CLASS}`,
            `.${DISCOVERY_HOST_CLASS}`,
        ].join(', ')));
    }

    function findVGenShowcaseStore(startFiber) {
        let fiber = startFiber;
        const seen = new Set();
        for (let depth = 0; fiber && depth < 120; depth += 1) {
            if (seen.has(fiber)) break;
            seen.add(fiber);
            const values = [
                fiber.memoizedProps,
                fiber.pendingProps,
                fiber.memoizedState,
                fiber.stateNode,
            ];
            let dependency = fiber.dependencies?.firstContext || null;
            for (let index = 0; dependency && index < 20; index += 1) {
                values.push(dependency.memoizedValue);
                dependency = dependency.next;
            }
            for (const value of values) {
                for (const candidate of [
                    value,
                    value?.store,
                    value?.value,
                    value?.value?.store,
                    value?.contextValue,
                    value?.contextValue?.store,
                ]) {
                    if (isShowcaseReduxStore(candidate)) return candidate;
                }
            }
            fiber = fiber.return || fiber.alternate?.return || null;
        }
        return null;
    }

    function isShowcaseReduxStore(value) {
        if (
            !value
            || typeof value.dispatch !== 'function'
            || typeof value.getState !== 'function'
        ) return false;
        try {
            return Boolean(getShowcaseBody(value));
        } catch {
            return false;
        }
    }

    function getShowcaseSlice(store = currentShowcaseStore) {
        if (!store || typeof store.getState !== 'function') return null;
        const state = store.getState();
        const candidates = [
            state?.showcase,
            state?.showcaseReducer,
            ...Object.values(state || {}),
        ];
        return candidates.find((candidate) => {
            const body = candidate?.body;
            return body
                && typeof body === 'object'
                && typeof body.title === 'string'
                && typeof body.description === 'string'
                && Array.isArray(body.tags)
                && Array.isArray(body.searchCategoryVariantKeys);
        }) || null;
    }

    function getShowcaseBody(store = currentShowcaseStore) {
        return getShowcaseSlice(store)?.body || null;
    }

    function dispatchShowcaseAction(action, store = currentShowcaseStore) {
        if (!getShowcaseBody(store)) return false;
        store.dispatch(clonePageValue(action));
        return true;
    }

    function deepQueryAll(root, selector) {
        if (!root?.querySelectorAll) return [];
        const result = [];
        const seen = new Set();
        const roots = [root];
        while (roots.length) {
            const currentRoot = roots.shift();
            if (!currentRoot || seen.has(currentRoot)) continue;
            seen.add(currentRoot);
            if (currentRoot instanceof Element && currentRoot.matches(selector)) {
                result.push(currentRoot);
            }
            result.push(...currentRoot.querySelectorAll(selector));
            for (const element of currentRoot.querySelectorAll('*')) {
                if (element.shadowRoot) roots.push(element.shadowRoot);
            }
        }
        return [...new Set(result)];
    }

    function isShadowRootNode(root) {
        return Boolean(root?.host && root.nodeType === 11);
    }

    function isWithinComposedTree(element, boundary) {
        if (!element || !boundary) return false;
        let node = element;
        for (let depth = 0; node && depth < 8; depth += 1) {
            if (node === boundary || boundary.contains?.(node)) return true;
            const root = node.getRootNode?.();
            if (!isShadowRootNode(root)) return false;
            node = root.host;
        }
        return false;
    }

    function outermostShadowHost(element, boundary) {
        let node = element;
        let outermost = null;
        for (let depth = 0; node && depth < 8; depth += 1) {
            const root = node.getRootNode?.();
            if (!isShadowRootNode(root)) break;
            outermost = root.host;
            node = root.host;
        }
        return outermost && isWithinComposedTree(outermost, boundary) ? outermost : null;
    }

    function findTagInput() {
        if (!currentSurface?.isConnected || !isSurfaceOpen(currentSurface)) return null;
        if (currentInput?.isConnected && refreshCurrentTagBridge()) return currentInput;
        const context = findShowcaseContext(currentSurface);
        if (!context) return null;
        currentBridge = context.bridge;
        currentTagRoot = context.root;
        currentTitleContext = context.title;
        currentDescriptionContext = context.description;
        currentDiscoveryContext = context.discovery;
        currentShowcaseStore = context.store || null;
        bindShowcaseStore(currentShowcaseStore);
        return context.input;
    }

    function findShowcaseContext(scope) {
        const tagContext = findTagContext(scope);
        if (!tagContext || !isUploadTagBridge(tagContext.bridge)) return null;
        const store = findVGenShowcaseStore(tagContext.bridge?.fiber);

        // 以已经确认的作品 TagSearch 为锚点，向上找到同一上传表单，再从其
        // React 子树读取 Title、Description 与 Discovery tags。可见文本仅作为
        // 旧版 VGen 的回退，避免组件标题被包装或延迟挂载后整个模块消失。
        const formContexts = findShowcaseFormContexts(tagContext.bridge, scope);
        const title = formContexts.title || findTextFieldContext(scope, 'title', store);
        const description = formContexts.description
            || findTextFieldContext(scope, 'description', store);
        // Discovery 的编辑中状态只存在 ShowcaseModal 的本地 formValues 中，
        // Redux body 只是打开弹窗时的初值。这里只接受与当前上传 TagSearch 同一
        // 表单子树中的 ShowcaseOptionsForm，不再用标题文本或 Redux 表层值代替。
        const discovery = formContexts.discovery;

        return {
            ...tagContext,
            store,
            title: title || null,
            description: description || null,
            discovery: discovery || null,
        };
    }

    function findTagContext(scope = document) {
        const candidates = findTagInputs(scope);
        let best = null;

        for (const input of candidates) {
            const bridge = findTagSearchBridge(input);
            if (!isUploadTagBridge(bridge)) continue;
            const root = bridge ? findTagSearchRoot(bridge, input) : null;
            const description = [
                input.getAttribute('placeholder'),
                input.getAttribute('data-placeholder'),
                input.getAttribute('aria-label'),
            ].filter(Boolean).join(' ');
            let score = 0;
            if (bridge) score += 10000;
            if (/add\s*tags?|添加标签/i.test(description)) score += 1000;
            if (input.closest('[role="dialog"], [aria-modal="true"]')) score += 600;
            if (isInViewport(input)) score += 250;
            if (input === document.activeElement) score += 160;
            if (input === currentInput) score += 80;

            if (!best || score > best.score) {
                best = { input, bridge, root, score };
            }
        }

        return best;
    }

    function findTagInputs(scope = document) {
        const queryRoot = scope instanceof Element || scope === document
            ? scope
            : document;
        const candidates = [
            ...(queryRoot.matches?.(TAG_CONTROL_SELECTOR) ? [queryRoot] : []),
            ...queryRoot.querySelectorAll(
                'input[placeholder], textarea[placeholder], ' +
                '[contenteditable="true"][data-placeholder], ' +
                '[contenteditable="true"][aria-label], [role="combobox"][aria-label]',
            ),
        ].filter((element) =>
            !element.closest(`#${PORTAL_ID}`)
            && !element.closest(`#${INLINE_HOST_ID}`)
            && isRendered(element),
        );

        const direct = candidates.filter((element) => {
            const description = [
                element.getAttribute('placeholder'),
                element.getAttribute('data-placeholder'),
                element.getAttribute('aria-label'),
            ].filter(Boolean).join(' ');
            return /add\s*tags?|search\s*tags?|添加标签|搜索标签/i.test(description);
        });
        const result = [...direct];

        const headings = [...queryRoot.querySelectorAll('label, h1, h2, h3, h4, p, span')]
            .filter((element) =>
                isRendered(element)
                && /^(search\s*tags?|搜索标签)$/i.test(element.textContent?.trim() || ''),
            )
            .slice(0, 8);

        for (const heading of headings) {
            let scope = heading.parentElement;
            for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
                const inputs = [
                    ...scope.querySelectorAll(
                        'input:not([type]), input[type="text"], textarea, ' +
                        '[contenteditable="true"], [role="combobox"]',
                    ),
                ].filter((element) =>
                    !element.closest(`#${PORTAL_ID}`)
                    && !element.closest(`#${INLINE_HOST_ID}`)
                    && isRendered(element),
                );
                if (inputs.length === 1) {
                    result.push(inputs[0]);
                    break;
                }
            }
        }

        return [...new Set(result)];
    }

    function findTagSearchBridge(input) {
        let node = input;

        for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1) {
            let fiber = getReactFiber(node);

            for (let fiberDepth = 0; fiber && fiberDepth < 45; fiberDepth += 1) {
                const bridge = bridgeFromFiber(fiber);
                if (bridge) return bridge;
                fiber = fiber.return;
            }

            node = node.parentElement;
        }

        return null;
    }

    function getReactFiber(element) {
        if (!element) return null;

        let properties = [];
        try {
            properties = Object.getOwnPropertyNames(element);
        } catch {
            // 继续尝试页面主环境的 Object。
        }

        try {
            const pageProperties = pageWindow.Object.getOwnPropertyNames(element);
            properties = [...new Set([...properties, ...pageProperties])];
        } catch {
            // 某些油猴环境可直接读取，无法跨环境读取时忽略。
        }

        const key = properties.find((property) =>
            property.startsWith('__reactFiber$')
            || property.startsWith('__reactInternalInstance$'),
        );
        return key ? element[key] : null;
    }

    function getReactProps(element) {
        if (!element) return null;

        let properties = [];
        try {
            properties = Object.getOwnPropertyNames(element);
        } catch {
            // 继续尝试页面主环境的 Object。
        }

        try {
            const pageProperties = pageWindow.Object.getOwnPropertyNames(element);
            properties = [...new Set([...properties, ...pageProperties])];
        } catch {
            // 跨环境不可读时，组件 state dispatch 仍可作为回退。
        }

        const key = properties.find((property) => property.startsWith('__reactProps$'));
        return key ? element[key] : null;
    }

    function isCurrentReactFiberBranch(fiber) {
        if (!fiber) return null;
        const seen = new Set();
        let root = fiber;
        while (root?.return && !seen.has(root)) {
            seen.add(root);
            root = root.return;
        }
        const currentRoot = root?.stateNode?.current;
        if (!currentRoot) return null;
        return currentRoot === root;
    }

    function currentFirstFiberCandidates(fiber) {
        const candidates = [...new Set([fiber, fiber?.alternate].filter(Boolean))];
        return candidates.sort((left, right) => {
            const score = (candidate) => {
                const current = isCurrentReactFiberBranch(candidate);
                return current === true ? 2 : current === null ? 1 : 0;
            };
            return score(right) - score(left);
        });
    }

    function bridgeFromFiber(fiber) {
        for (const candidate of currentFirstFiberCandidates(fiber)) {
            if (!candidate) continue;
            for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                if (!isTagSearchProps(props)) continue;
                return {
                    fiber: candidate,
                    props,
                    onChange: props.onChange,
                    initialTags: [...props.initialTags],
                    tagLimit: Number.isFinite(Number(props.tagLimit))
                        ? Number(props.tagLimit)
                        : 5,
                };
            }
        }
        return null;
    }

    function isTagSearchProps(props) {
        if (!props || typeof props !== 'object') return false;
        if (!Array.isArray(props.initialTags) || typeof props.onChange !== 'function') {
            return false;
        }
        return Object.prototype.hasOwnProperty.call(props, 'tagLimit')
            || Object.prototype.hasOwnProperty.call(props, 'showSelectedTags')
            || Object.prototype.hasOwnProperty.call(props, 'tagsToSuggest');
    }

    function findTagSearchRoot(bridge, input) {
        const queue = [bridge?.fiber?.child].filter(Boolean);
        const seen = new Set();

        while (queue.length && seen.size < 120) {
            const fiber = queue.shift();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);

            const element = fiber.stateNode;
            if (
                element?.nodeType === 1
                && element !== input
                && element.contains?.(input)
            ) {
                return element;
            }

            if (fiber.child) queue.push(fiber.child);
            if (fiber.sibling) queue.push(fiber.sibling);
        }

        return findInlineAnchor(input);
    }

    function findShowcaseFormContexts(tagBridge, scope) {
        const found = { title: null, description: null, discovery: null };
        let ancestor = tagBridge?.fiber || null;
        const scannedFibers = new Set();

        // 旧实现会对 55 层祖先分别遍历完整子树，相同 Fiber 在一次查找中可能被
        // 访问几十次。共享 seen 后，向上扩大的每一层只检查此前没覆盖的新分支。
        for (
            let depth = 0;
            ancestor && depth < 55 && scannedFibers.size < 4200;
            depth += 1
        ) {
            for (const fiber of walkFiberSubtree(ancestor, 4200, scannedFibers)) {
                for (const candidate of [fiber, fiber?.alternate]) {
                    if (!candidate) continue;
                    for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                        if (!found.title && isTextFieldProps(props, 'title')) {
                            found.title = textFieldContextFromComponent(
                                candidate, props, 'title', scope,
                            );
                        }
                        if (!found.description && isTextFieldProps(props, 'description')) {
                            found.description = textFieldContextFromComponent(
                                candidate, props, 'description', scope,
                            );
                        }
                        if (!found.discovery) {
                            const bridge = discoveryBridgeFromProps(candidate, props);
                            if (bridge) {
                                found.discovery = discoveryContextFromComponent(
                                    candidate, bridge, scope,
                                );
                            }
                        }
                    }
                }
                // 当前 VGen 的 RichTextEditor 由独立 React root 挂入双层 Shadow DOM，
                // 不属于 TagSearch 所在表单 Fiber。Title 与 ShowcaseOptionsForm 找齐后
                // 立即停止；Description 交给下面已验证的 composed-DOM 路径处理。
                if (found.title && found.discovery) return found;
            }
            ancestor = ancestor.return || ancestor.alternate?.return || null;
        }
        return found;
    }

    function walkFiberSubtree(rootFiber, limit = 600, seen = new Set()) {
        const result = [];
        const stack = [rootFiber].filter(Boolean);
        while (stack.length && seen.size < limit) {
            const fiber = stack.pop();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);
            result.push(fiber);
            const children = [];
            let child = fiber.child;
            while (child && children.length < 180) {
                children.push(child);
                child = child.sibling;
            }
            for (let index = children.length - 1; index >= 0; index -= 1) {
                stack.push(children[index]);
            }
        }
        return result;
    }

    function componentHostElements(fiber, scope, limit = 500) {
        const elements = [];
        for (const item of walkFiberSubtree(fiber, limit)) {
            const element = item?.stateNode;
            if (
                element?.nodeType === 1
                && element.isConnected
                && isWithinComposedTree(element, scope)
                && !isToolElement(element)
            ) {
                elements.push(element);
            }
        }
        return [...new Set(elements)];
    }

    function textFieldContextFromComponent(fiber, props, kind, scope) {
        const hosts = componentHostElements(fiber, scope);
        const control = kind === 'title'
            ? hosts.find((element) =>
                element.matches?.('input:not([type]), input[type="text"]'),
            )
            : hosts.find((element) =>
                element.matches?.('[data-slate-editor="true"], [contenteditable="true"], [role="textbox"], textarea'),
            ) || hosts.find((element) =>
                element.matches?.('.descriptionEditor')
                && element.querySelector?.(':scope > .innerEditor'),
            );
        if (!control) return null;

        const bridge = {
            fiber,
            props,
            value: readTextPropsValue(props),
            commit: getTextFieldCommit(props, kind),
            editor: kind === 'description' ? findSlateEditorInSubtree(fiber) : null,
        };
        return {
            kind,
            control,
            bridge,
            root: findTextFieldRoot(control, bridge, kind),
            score: 100000,
        };
    }

    function findSlateEditorInSubtree(fiber) {
        for (const candidate of walkFiberSubtree(fiber, 700)) {
            const editor = findSlateEditor(candidate);
            if (editor) return editor;
        }
        return null;
    }

    function discoveryContextFromComponent(fiber, bridge, scope) {
        const optionBindings = bridge.optionBindings || [];
        const optionRoots = optionBindings.map((binding) =>
            findShowcaseOptionRoot(binding, scope),
        ).filter(Boolean);
        if (!optionRoots.length) return null;

        const optionsRoot = smallestCommonElement(optionRoots, scope);
        const hosts = componentHostElements(fiber, scope, 900);
        const root = hosts.filter((element) =>
            element !== optionsRoot
            && element.contains?.(optionsRoot),
        ).sort((left, right) => elementDepth(right) - elementDepth(left))[0]
            || optionsRoot?.parentElement
            || null;
        if (!root) return null;

        const heading = optionsRoot?.parentElement === root
            ? optionsRoot.previousElementSibling || root.firstElementChild
            : root.firstElementChild;
        return {
            heading: heading || root,
            root,
            optionsRoot,
            bridge,
            schema: bridge.schema,
            values: bridge.values,
            optionBindings,
        };
    }

    function findShowcaseOptionRoot(binding, scope) {
        const hosts = componentHostElements(binding?.fiber, scope, 220);
        return hosts.filter((element) => hosts.every((host) =>
            element === host || element.contains?.(host),
        )).sort((left, right) => elementDepth(right) - elementDepth(left))[0] || null;
    }

    function findTextFieldContext(scope, kind, store = currentShowcaseStore) {
        const selector = kind === 'title'
            ? 'input:not([type]), input[type="text"]'
            : '.descriptionEditor, [contenteditable="true"], [role="textbox"], textarea';
        const candidates = deepQueryAll(scope, selector)
            .filter((element) => !isToolElement(element) && isRendered(element));

        let best = null;
        for (const control of candidates) {
            const nativeBridge = findTextFieldBridge(control, kind);
            const isStrongDescriptionControl = kind !== 'description'
                || control.matches?.('.descriptionEditor, [contenteditable="true"], [data-slate-editor="true"]')
                || Boolean(outermostShadowHost(control, scope));
            if (!nativeBridge && !isStrongDescriptionControl) continue;
            const bridge = nativeBridge || createReduxTextFieldBridge(control, kind, store);
            if (!bridge) continue;
            let score = 1000;
            if (kind === 'description' && bridge.editor) score += 500;
            if (isInViewport(control)) score += 80;
            if (control === document.activeElement) score += 40;
            if (kind === 'title' && /new showcase/i.test(control.getAttribute('placeholder') || '')) {
                score += 120;
            }
            if (kind === 'description' && control.closest('.descriptionEditor')) score += 120;

            if (!best || score > best.score) {
                best = {
                    kind,
                    control,
                    bridge,
                    root: findTextFieldRoot(control, bridge, kind),
                    score,
                };
            }
        }
        return best;
    }

    function createReduxTextFieldBridge(control, kind, store) {
        const body = getShowcaseBody(store);
        if (!body) return null;
        const fiber = getReactFiber(control);
        return {
            fiber,
            props: null,
            value: String(kind === 'title' ? body.title : body.description),
            commit: kind === 'title'
                ? (event) => dispatchShowcaseAction({
                    type: 'SHOWCASE/UPDATE-TITLE',
                    title: String(event?.target?.value || ''),
                }, store)
                : (description) => dispatchShowcaseAction({
                    type: 'SHOWCASE/UPDATE-DESCRIPTION',
                    description: normalizeRichTextJson(description),
                }, store),
            editor: kind === 'description' ? findSlateEditorFromControl(control) : null,
            store,
        };
    }

    function findSlateEditorFromControl(control) {
        let fiber = getReactFiber(control);
        const seen = new Set();
        for (let depth = 0; fiber && depth < 70; depth += 1) {
            if (seen.has(fiber)) break;
            seen.add(fiber);
            const editor = findSlateEditor(fiber);
            if (editor) return editor;
            fiber = fiber.return || fiber.alternate?.return || null;
        }
        return null;
    }

    function findTextFieldBridge(control, kind) {
        let node = control;
        let fallback = null;

        for (let nodeDepth = 0; node && nodeDepth < 8; nodeDepth += 1) {
            let fiber = getReactFiber(node);
            for (let fiberDepth = 0; fiber && fiberDepth < 55; fiberDepth += 1) {
                for (const candidate of [fiber, fiber.alternate]) {
                    if (!candidate) continue;
                    for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                        if (!isTextFieldProps(props, kind)) continue;
                        const bridge = {
                            fiber: candidate,
                            props,
                            value: readTextPropsValue(props),
                            commit: getTextFieldCommit(props, kind),
                            editor: kind === 'description'
                                ? findSlateEditor(candidate) || findSlateEditorInSubtree(candidate)
                                : null,
                        };
                        if (kind === 'title' || bridge.editor) return bridge;
                        fallback ||= bridge;
                    }
                }
                fiber = fiber.return;
            }
            node = node.parentElement || node.getRootNode?.()?.host || null;
        }
        return fallback;
    }

    function isTextFieldProps(props, kind) {
        if (!props || typeof props !== 'object') return false;
        const label = [props.label, props.placeholder, props['aria-label']]
            .filter(Boolean).join(' ').trim().toLocaleLowerCase();
        const value = readTextPropsValue(props);
        const commit = getTextFieldCommit(props, kind);
        if (kind === 'title') {
            return /(^|\s)title($|\s)/.test(label)
                && typeof commit === 'function'
                && typeof props.value === 'string';
        }
        return typeof commit === 'function'
            && (
                /description|简介|描述/i.test(label)
                || looksLikeRichTextJson(value)
            );
    }

    function readTextPropsValue(props) {
        const value = props?.value ?? props?.initialValue ?? '';
        return typeof value === 'string' ? value : '';
    }

    function getTextFieldCommit(props, kind) {
        if (kind === 'title') return props?.onChange;
        return props?.onEditCallback || props?.onValueChange || props?.onChange;
    }

    function looksLikeRichTextJson(value) {
        try {
            const parsed = JSON.parse(String(value || ''));
            return Array.isArray(parsed)
                && parsed.length > 0
                && parsed.every((node) =>
                    node && typeof node === 'object' && Array.isArray(node.children),
                );
        } catch {
            return false;
        }
    }

    function findSlateEditor(fiber) {
        for (const candidate of [fiber, fiber?.alternate]) {
            let hook = candidate?.memoizedState;
            let inspected = 0;
            while (hook && inspected < 40) {
                const value = hook.memoizedState;
                if (
                    value
                    && typeof value === 'object'
                    && Array.isArray(value.children)
                    && typeof value.apply === 'function'
                    && typeof value.onChange === 'function'
                ) {
                    return value;
                }
                hook = hook.next;
                inspected += 1;
            }
        }
        return null;
    }

    function findTextFieldRoot(control, bridge, kind) {
        if (kind === 'description') {
            const innerEditor = control.closest?.('.innerEditor');
            if (innerEditor?.parentElement) return innerEditor.parentElement;
            const ownInnerEditor = control.querySelector?.(':scope > .innerEditor');
            if (ownInnerEditor) return control;
            const editorShell = control.closest?.('.descriptionEditor');
            if (editorShell?.querySelector?.(':scope > .innerEditor')) return editorShell;
        }
        const shadowHost = outermostShadowHost(control, currentSurface);
        if (shadowHost) {
            return shadowHost.closest('.descriptionEditor, .inputField')
                || shadowHost.parentElement
                || shadowHost;
        }
        const direct = kind === 'title'
            ? control.closest('.inputField')
            : control.closest('.descriptionEditor, [data-slate-editor="true"]');
        if (direct) return direct;

        const queue = [bridge?.fiber?.child].filter(Boolean);
        const seen = new Set();
        while (queue.length && seen.size < 140) {
            const fiber = queue.shift();
            if (!fiber || seen.has(fiber)) continue;
            seen.add(fiber);
            const element = fiber.stateNode;
            if (element?.nodeType === 1 && element.contains?.(control)) return element;
            if (fiber.child) queue.push(fiber.child);
            if (fiber.sibling) queue.push(fiber.sibling);
        }
        return control.parentElement || control;
    }

    function discoveryBridgeFromProps(fiber, props) {
        if (!props || typeof props !== 'object') return null;
        if (
            !props.formValues
            || typeof props.formValues !== 'object'
            || Array.isArray(props.formValues)
            || typeof props.onFormValueChange !== 'function'
        ) return null;

        const optionBindings = collectShowcaseOptionBindings(
            fiber,
            props.onFormValueChange,
        );
        if (!optionBindings.length) return null;
        const schema = normalizeDiscoverySchema(
            optionBindings.map((binding) => binding.option),
        );
        if (!schema.length || schema.length !== optionBindings.length) return null;

        return {
            fiber,
            values: clonePageValue(props.formValues),
            commitOption: props.onFormValueChange,
            commitAll: null,
            schema,
            optionBindings,
        };
    }

    function collectShowcaseOptionBindings(rootFiber, formValueChange) {
        const bindings = new Map();
        for (const fiber of walkFiberSubtree(rootFiber, 700)) {
            for (const candidate of [fiber, fiber?.alternate]) {
                if (!candidate) continue;
                for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                    const option = props?.option;
                    const optionID = String(option?.optionID || '').trim();
                    if (
                        !optionID
                        || !Array.isArray(option?.variants)
                        || !Object.prototype.hasOwnProperty.call(props, 'selectedVariants')
                        || Object.prototype.hasOwnProperty.call(props, 'currentSelectedVariants')
                        || Object.prototype.hasOwnProperty.call(props, 'isRequired')
                        || props.onFormValueChange !== formValueChange
                        || !hasShowcaseOptionDisclosureFiber(candidate)
                    ) continue;
                    if (!bindings.has(optionID)) {
                        bindings.set(optionID, {
                            fiber: candidate,
                            option,
                            selectedVariants: clonePageValue(props.selectedVariants),
                            onFormValueChange: props.onFormValueChange,
                        });
                    }
                }
            }
        }
        return [...bindings.values()];
    }

    function hasShowcaseOptionDisclosureFiber(rootFiber) {
        return walkFiberSubtree(rootFiber, 220).some((fiber) =>
            [fiber?.memoizedProps, fiber?.pendingProps]
                .some((props) => isShowcaseExpandableSectionProps(props)),
        );
    }

    function normalizeDiscoverySchema(value) {
        if (!Array.isArray(value)) return [];
        return value.map((option) => {
            const optionID = String(option?.optionID || option?.id || '').trim();
            const variants = Array.isArray(option?.variants)
                ? option.variants.map((variant) => ({
                    variantID: String(
                        variant?.variantID || variant?.value || variant?.id || variant?.name || '',
                    ).trim(),
                    label: String(
                        variant?.label || variant?.name || variant?.variantID || variant?.value || '',
                    ).trim(),
                })).filter((variant) => variant.variantID)
                : [];
            if (!optionID || !variants.length) return null;
            return {
                optionID,
                label: String(option?.label || option?.name || optionID).trim(),
                allowMultipleSelections: Boolean(option?.allowMultipleSelections),
                variants,
            };
        }).filter(Boolean);
    }

    function variantKeysToDiscoveryValues(variantKeys, schema = []) {
        const values = {};
        const schemaMap = new Map(schema.map((option) => [option.optionID, option]));
        for (const key of variantKeys || []) {
            const [optionID, variantID] = String(key || '').split('_');
            if (!optionID || !variantID) continue;
            const multiple = schemaMap.get(optionID)?.allowMultipleSelections;
            if (multiple) {
                if (!Array.isArray(values[optionID])) values[optionID] = [];
                if (!values[optionID].includes(variantID)) values[optionID].push(variantID);
            } else if (Object.prototype.hasOwnProperty.call(values, optionID)) {
                const current = Array.isArray(values[optionID])
                    ? values[optionID]
                    : [values[optionID]];
                if (!current.includes(variantID)) current.push(variantID);
                values[optionID] = current;
            } else {
                values[optionID] = variantID;
            }
        }
        return values;
    }

    function discoveryValuesToVariantKeys(values) {
        const keys = [];
        for (const [optionID, selected] of Object.entries(normalizeDiscoveryValues(values))) {
            for (const variantID of Array.isArray(selected) ? selected : [selected]) {
                if (optionID && variantID) keys.push(`${optionID}_${variantID}`);
            }
        }
        return keys;
    }

    function clonePageValue(value) {
        try {
            return pageWindow.JSON.parse(pageWindow.JSON.stringify(value));
        } catch {
            return value && typeof value === 'object' ? { ...value } : value;
        }
    }

    function placePanel() {
        if (
            !settings.modules.tags
            ||
            !currentInput
            || !currentInput.isConnected
            || isDisabled(currentInput)
            || !currentBridge
        ) {
            panel.hidden = true;
            inlineHost?.remove();
            inlineHost = null;
            return;
        }

        if (panel.hidden) panel.hidden = false;
        ensureInlineHost();
        if (inlineHost && panel.parentElement !== inlineHost) {
            inlineHost.appendChild(panel);
            protectTranslationRoot(panel);
            protectTranslationRoot(inlineHost);
        }
        if (inlineHost.classList.contains('vtq-hidden')) inlineHost.classList.remove('vtq-hidden');
        if (!panel.classList.contains('vtq-inline')) panel.classList.add('vtq-inline');
    }

    function ensureInlineHost() {
        if (!inlineHost || !inlineHost.isConnected) {
            inlineHost = document.createElement('div');
            inlineHost.id = INLINE_HOST_ID;
            protectTranslationRoot(inlineHost);
        }

        const anchor = currentTagRoot?.isConnected
            ? currentTagRoot
            : findInlineAnchor(currentInput);
        if (!anchor?.parentElement) return;
        if (inlineHost.previousElementSibling !== anchor) {
            anchor.insertAdjacentElement('afterend', inlineHost);
        }
    }

    function findInlineAnchor(input) {
        const inputRect = input.getBoundingClientRect();
        let anchor = input.parentElement || input;

        for (let depth = 0; depth < 5 && anchor.parentElement; depth += 1) {
            const parent = anchor.parentElement;
            if (parent === document.body || parent === document.documentElement) break;

            const text = (parent.textContent || '').slice(0, 700);
            const width = parent.getBoundingClientRect().width;
            const containsTagHeading = /search\s*tags?|搜索标签/i.test(text);
            const widthIsReasonable = !inputRect.width
                || !width
                || width <= Math.max(inputRect.width * 1.65, inputRect.width + 260);

            if (!widthIsReasonable && !containsTagHeading) break;
            anchor = parent;
            if (containsTagHeading) break;
        }

        return anchor;
    }

    function ensureCopyPresetBars() {
        const contexts = {
            title: currentTitleContext,
            description: currentDescriptionContext,
        };

        for (const kind of ['title', 'description']) {
            if (!settings.modules[kind]) {
                copyHosts[kind]?.remove();
                copyHosts[kind] = null;
                continue;
            }
            const context = contexts[kind];
            const descriptionMount = kind === 'description'
                ? resolveDescriptionPresetMount(context)
                : null;
            const anchor = descriptionMount?.container || context?.root;
            const canHostInsideField = kind === 'description'
                ? Boolean(anchor?.isConnected && descriptionMount?.editorBox?.isConnected)
                : Boolean(anchor?.isConnected && anchor.parentElement);
            if (!canHostInsideField) {
                if (kind === 'title' || !copyHosts[kind]?.isConnected) {
                    copyHosts[kind]?.remove();
                    copyHosts[kind] = null;
                }
                continue;
            }

            let host = copyHosts[kind];
            if (!host?.isConnected) {
                host = document.createElement('div');
                host.className = COPY_HOST_CLASS;
                protectTranslationRoot(host);
                host.dataset.copyKind = kind;
                copyHosts[kind] = host;
            }
            if (kind === 'title') {
                if (host.parentElement !== anchor) {
                    anchor.appendChild(host);
                }
            } else {
                const editorBox = descriptionMount.editorBox;
                if (host.parentElement !== anchor || host.nextElementSibling !== editorBox) {
                    anchor.insertBefore(host, editorBox);
                }
                ensurePresetShadowStyles(host);
            }
            presetHostAnchors.set(host, anchor);
            renderCopyPresetBar(kind);
        }
    }

    function resolveDescriptionPresetMount(context) {
        if (!context) return null;
        const candidates = [context.control, context.root].filter((element) =>
            element?.isConnected,
        );
        for (const element of candidates) {
            const innerEditor = element.matches?.('.innerEditor')
                ? element
                : element.closest?.('.innerEditor')
                    || element.querySelector?.(':scope > .innerEditor');
            if (innerEditor?.parentElement) {
                return { container: innerEditor.parentElement, editorBox: innerEditor };
            }
            const shell = element.matches?.('.descriptionEditor')
                ? element
                : element.closest?.('.descriptionEditor');
            const shellEditor = shell?.querySelector?.(':scope > .innerEditor');
            if (shellEditor) return { container: shell, editorBox: shellEditor };
        }
        return null;
    }

    function ensurePresetShadowStyles(host) {
        const root = host?.getRootNode?.();
        if (!isShadowRootNode(root) || root.querySelector('style[data-vtq-shadow-style]')) return;
        const style = document.createElement('style');
        style.dataset.vtqShadowStyle = 'description-preset';
        style.textContent = `
            .${COPY_HOST_CLASS}, .${COPY_HOST_CLASS} * { box-sizing: border-box; }
            .${COPY_HOST_CLASS} {
                --vtq-bg: #fff; --vtq-soft: #f3f6fb; --vtq-hover: #e9eef8;
                --vtq-text: #252a37; --vtq-muted: #737b8e;
                --vtq-border: rgba(32,45,69,.15); --vtq-blue: #4f7cff;
                --vtq-green: #20cda7; --vtq-blue-soft: rgba(79,124,255,.13);
                width: 100%; margin: 0 0 6px; color: var(--vtq-text);
                font: 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;
            }
            .${COPY_HOST_CLASS}[data-theme="dark"] {
                --vtq-bg: #30313f; --vtq-soft: #3a3c4a; --vtq-hover: #454857;
                --vtq-text: #f2f4f8; --vtq-muted: #b7bdca;
                --vtq-border: rgba(255,255,255,.13); --vtq-blue: #7195ff;
                --vtq-green: #3bdfbc; --vtq-blue-soft: rgba(113,149,255,.17);
            }
            .${COPY_HOST_CLASS} .vtq-copy-strip {
                position: relative; overflow: hidden; border: 1px solid var(--vtq-border);
                border-radius: 8px; color: var(--vtq-text); background: var(--vtq-soft);
            }
            .${COPY_HOST_CLASS} .vtq-copy-strip::before {
                position: absolute; top: 0; right: 0; left: 0; z-index: 1;
                height: 2px; background: linear-gradient(90deg,var(--vtq-blue),var(--vtq-green)); content: "";
            }
            .${COPY_HOST_CLASS} .vtq-copy-strip-row {
                display: flex; align-items: center; min-height: 28px;
                padding: 3px 3px 2px 7px; gap: 5px;
            }
            .${COPY_HOST_CLASS} .vtq-copy-label { font-size: 11px; font-weight: 700; }
            .${COPY_HOST_CLASS} .vtq-dropdown-label {
                flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .${COPY_HOST_CLASS} .vtq-preset-select {
                min-width: 0; height: 23px; flex: 1; padding: 1px 24px 1px 7px;
                overflow: hidden; border: 1px solid var(--vtq-border); border-radius: 6px;
                color: var(--vtq-text); background: var(--vtq-bg); cursor: pointer;
                font: inherit; font-size: 11px; text-overflow: ellipsis; white-space: nowrap;
            }
            .${COPY_HOST_CLASS} .vtq-preset-select:focus {
                border-color: var(--vtq-blue); outline: none; box-shadow: 0 0 0 2px var(--vtq-blue-soft);
            }
            .${COPY_HOST_CLASS} .vtq-copy-strip-actions { display: flex; align-items: center; gap: 3px; }
            .${COPY_HOST_CLASS} .vtq-copy-action {
                display: inline-flex; min-width: 21px; width: 21px; height: 21px;
                min-height: 21px; padding: 0; border: 1px solid transparent;
                border-radius: 6px; color: var(--vtq-muted); background: transparent;
                cursor: pointer; align-items: center; justify-content: center;
                font: inherit; font-size: 12px; line-height: 0;
            }
            .${COPY_HOST_CLASS} .vtq-copy-action:hover {
                border-color: var(--vtq-border); color: var(--vtq-blue); background: var(--vtq-hover);
            }
            .${COPY_HOST_CLASS} [class*="immersive-translate-target-translation-inline-wrapper"],
            .${COPY_HOST_CLASS} [class*="immersive-translate-target-translation-block-wrapper"] {
                display: none !important;
            }
            .${COPY_HOST_CLASS} .immersive-translate-target-wrapper { display: contents !important; }
        `;
        root.appendChild(style);
    }

    function ensureGlobalPresetBar() {
        if (!settings.modules.global) {
            globalHost?.remove();
            globalHost = null;
            return;
        }
        const titleAnchor = currentTitleContext?.root;
        const sidebar = findGlobalPresetContainer(currentSurface);
        if (!sidebar && (!titleAnchor?.isConnected || !titleAnchor.parentElement)) {
            globalHost?.remove();
            globalHost = null;
            return;
        }
        if (!globalHost?.isConnected) {
            globalHost = document.createElement('div');
            globalHost.className = GLOBAL_HOST_CLASS;
            protectTranslationRoot(globalHost);
        }
        const anchor = sidebar || titleAnchor;
        if (sidebar) {
            if (
                presetHostAnchors.get(globalHost) !== sidebar
                || globalHost.parentElement !== sidebar
                || globalHost !== sidebar.lastElementChild
            ) {
                sidebar.appendChild(globalHost);
            }
        } else if (
            presetHostAnchors.get(globalHost) !== titleAnchor
            || globalHost.parentElement !== titleAnchor.parentElement
        ) {
            titleAnchor.insertAdjacentElement('beforebegin', globalHost);
        }
        presetHostAnchors.set(globalHost, anchor);
        renderGlobalPresetBar(false, readCurrentDiscoveryValues(false));
    }

    function findGlobalPresetContainer(surface) {
        if (!surface?.isConnected) return null;
        if (
            currentGlobalPresetContainer?.isConnected
            && surface.contains(currentGlobalPresetContainer)
        ) {
            return currentGlobalPresetContainer;
        }

        // ShowcaseModal 当前把左侧原生选项统一放在 serviceSideColumn。
        // 优先使用真实布局结构，避免对数百个可见元素逐一读取文字与计算样式；
        // 下面的标记定位仅作为旧版或未来类名变化时的兼容回退。
        const structuredSidebar = surface.querySelector('.serviceSideColumn');
        if (
            structuredSidebar?.isConnected
            && !isToolElement(structuredSidebar)
        ) {
            currentGlobalPresetContainer = structuredSidebar;
            return currentGlobalPresetContainer;
        }
        const markerPatterns = [
            /link\s+commission\s+service/i,
            /tag\s+character\s+profiles?/i,
            /mark\s+as\s+sensitive\s+content/i,
        ];
        const candidates = [...surface.querySelectorAll('label, button, a, span, p, div')]
            .filter((element) => !isToolElement(element) && isRendered(element));
        const markers = markerPatterns.map((pattern) => candidates
            .filter((element) => pattern.test(normalizeUiText(element.textContent)))
            .sort((left, right) => elementDepth(right) - elementDepth(left))[0],
        ).filter(Boolean);
        if (markers.length < 2) return null;

        let common = markers[0];
        while (
            common
            && common !== surface
            && !markers.every((element) => common.contains(element))
        ) {
            common = common.parentElement;
        }
        if (!common || common === surface || !surface.contains(common)) return null;
        currentGlobalPresetContainer = common;
        return currentGlobalPresetContainer;
    }

    function normalizeUiText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function nativeUiText(element) {
        if (!element) return '';
        const clone = element.cloneNode(true);
        for (const translation of clone.querySelectorAll?.([
            '[class*="immersive-translate-target-translation-inline-wrapper"]',
            '[class*="immersive-translate-target-translation-block-wrapper"]',
            '[data-immersive-translate-translation-element-mark]',
        ].join(', ')) || []) {
            translation.remove();
        }
        return normalizeUiText(clone.textContent);
    }

    function elementDepth(element) {
        let depth = 0;
        for (let node = element; node?.parentElement; node = node.parentElement) depth += 1;
        return depth;
    }

    function ensureDiscoveryPresetBar() {
        if (!settings.modules.discovery) {
            discoveryHost?.remove();
            discoveryHost = null;
            return;
        }
        const root = currentDiscoveryContext?.root;
        let anchor = currentDiscoveryContext?.heading || root;
        if (root?.contains?.(anchor) && anchor !== root) {
            while (anchor.parentElement && anchor.parentElement !== root) {
                anchor = anchor.parentElement;
            }
        }
        if (!anchor?.isConnected || (!anchor.parentElement && anchor !== root)) {
            discoveryHost?.remove();
            discoveryHost = null;
            return;
        }
        if (!discoveryHost?.isConnected) {
            discoveryHost = document.createElement('div');
            discoveryHost.className = DISCOVERY_HOST_CLASS;
            protectTranslationRoot(discoveryHost);
        }
        if (anchor === root) {
            if (discoveryHost.parentElement !== root) {
                root.appendChild(discoveryHost);
            }
        } else if (
            presetHostAnchors.get(discoveryHost) !== anchor
            || discoveryHost.parentElement !== anchor.parentElement
        ) {
            anchor.insertAdjacentElement('afterend', discoveryHost);
        }
        presetHostAnchors.set(discoveryHost, anchor);
        renderDiscoveryPresetBar(false, readCurrentDiscoveryValues(false));
    }

    function refreshEnabledModules() {
        if (settings.modules.tags) placePanel();
        else {
            panel.hidden = true;
            inlineHost?.remove();
            inlineHost = null;
        }
        if (settings.modules.discovery && settings.autoCollapseDiscovery) {
            startDiscoveryOptionCollapse(currentSurface, currentDiscoveryContext);
        } else {
            stopDiscoveryOptionCollapse(currentSurface);
        }
        ensureGlobalPresetBar();
        ensureCopyPresetBars();
        ensureDiscoveryPresetBar();
        applyThemeMode();
    }

    function protectPluginUiFromTranslation() {
        for (const root of [portal, panel, inlineHost, globalHost, discoveryHost, ...Object.values(copyHosts)]) {
            if (root?.isConnected) protectTranslationRoot(root);
        }
    }

    function refreshModuleSwitches() {
        for (const input of portal.querySelectorAll('[data-module]')) {
            input.checked = settings.modules[input.dataset.module] !== false;
        }
        const autoCollapseDiscovery = portal.querySelector('[data-auto-collapse-discovery]');
        if (autoCollapseDiscovery) {
            autoCollapseDiscovery.checked = settings.autoCollapseDiscovery !== false;
        }
    }

    function removeCopyPresetBars() {
        for (const kind of ['title', 'description']) {
            copyHosts[kind]?.remove();
            copyHosts[kind] = null;
        }
    }

    function removeAllPresetBars() {
        removeCopyPresetBars();
        globalHost?.remove();
        globalHost = null;
        discoveryHost?.remove();
        discoveryHost = null;
    }

    function renderCopyPresetBars(force = false) {
        for (const kind of ['title', 'description']) {
            if (copyHosts[kind]?.isConnected) renderCopyPresetBar(kind, force);
        }
    }

    function renderCopyPresetBar(kind, force = false) {
        const host = copyHosts[kind];
        if (!host) return;
        const presets = copyPresets[kind] || [];
        const label = kind === 'title' ? 'Title 标题预设' : 'Description 描述预设';
        renderDropdownPresetBar({
            host,
            label,
            presets,
            optionText: (preset) => kind === 'title'
                ? formatTitlePresetLabel(preset)
                : preset.name,
            selectedPresetId: findMatchingCopyPresetId(kind),
            saveCurrent: () => saveCurrentTextAsPreset(kind),
            applyPreset: (presetId, select) => applyCopyPreset(kind, presetId, select),
            manage: () => openModal(kind),
            force,
        });
    }

    function renderGlobalPresetBar(force = false, discoveryValues = undefined) {
        if (!globalHost) return;
        renderDropdownPresetBar({
            host: globalHost,
            label: '全局上传预设',
            presets: globalPresets,
            optionText: (preset) => preset.name,
            selectedPresetId: findMatchingGlobalPresetId(discoveryValues),
            saveCurrent: saveCurrentAsGlobalPreset,
            applyPreset: (presetId, select) => applyGlobalPreset(presetId, select),
            manage: () => openModal('global'),
            refresh: refreshPresetDataFromStorage,
            showPluginInfo: true,
            force,
        });
    }

    function renderDiscoveryPresetBar(force = false, discoveryValues = undefined) {
        if (!discoveryHost) return;
        renderDropdownPresetBar({
            host: discoveryHost,
            label: 'Discovery tags 发现标签预设',
            presets: discoveryPresets,
            optionText: (preset) => preset.name,
            selectedPresetId: findMatchingDiscoveryPresetId(discoveryValues),
            saveCurrent: saveCurrentDiscoveryAsPreset,
            applyPreset: (presetId, select) => applyDiscoveryPreset(presetId, select),
            manage: () => openModal('discovery'),
            force,
        });
    }

    function formatTitlePresetLabel(preset) {
        const value = String(preset?.value || '').trim();
        const note = String(preset?.note || '').trim();
        return note ? `${value}【${note}】` : value;
    }

    function findMatchingCopyPresetId(kind) {
        const context = kind === 'title' ? currentTitleContext : currentDescriptionContext;
        const showcaseBody = getShowcaseBody();
        if (!context && !showcaseBody) return '';
        const currentValue = showcaseBody
            ? String(kind === 'title' ? showcaseBody.title : showcaseBody.description)
            : readTextFieldValue(kind, context);
        return (copyPresets[kind] || []).find((preset) =>
            kind === 'description'
                ? richTextValuesEqual(currentValue, preset.value)
                : String(currentValue) === String(preset.value),
        )?.id || '';
    }

    function findMatchingDiscoveryPresetId(
        currentValues = readCurrentDiscoveryValues(),
    ) {
        if (!currentValues) return '';
        const currentKey = normalizedDiscoveryVariantKeySetKey(
            discoveryValuesToVariantKeys(currentValues),
        );
        return discoveryPresets.find((preset) =>
            normalizedDiscoveryVariantKeySetKey(
                discoveryValuesToVariantKeys(preset.values),
            ) === currentKey,
        )?.id || '';
    }

    function findMatchingGlobalPresetId(
        discoveryValues = readCurrentDiscoveryValues(),
    ) {
        const showcaseBody = getShowcaseBody();
        if (showcaseBody && discoveryValues) {
            const discoveryKey = normalizedDiscoveryVariantKeySetKey(
                discoveryValuesToVariantKeys(discoveryValues),
            );
            const tagsKey = normalizedTagSetKey(showcaseBody.tags);
            return globalPresets.find((preset) =>
                String(preset.title) === String(showcaseBody.title)
                && richTextValuesEqual(preset.description, showcaseBody.description)
                && normalizedDiscoveryVariantKeySetKey(
                    discoveryValuesToVariantKeys(preset.discoveryValues),
                ) === discoveryKey
                && normalizedTagSetKey(preset.tags) === tagsKey,
            )?.id || '';
        }
        const titleContext = currentTitleContext;
        const descriptionContext = currentDescriptionContext;
        if (!titleContext || !descriptionContext || !discoveryValues || !currentBridge) return '';
        const title = readTextFieldValue('title', titleContext);
        const description = readTextFieldValue('description', descriptionContext);
        const discoveryKey = stableJson(normalizeDiscoveryValues(discoveryValues));
        const tagsKey = normalizedTagSetKey(currentBridge.initialTags || []);
        return globalPresets.find((preset) =>
            String(preset.title) === String(title)
            && richTextValuesEqual(preset.description, description)
            && stableJson(normalizeDiscoveryValues(preset.discoveryValues)) === discoveryKey
            && normalizedTagSetKey(preset.tags) === tagsKey,
        )?.id || '';
    }

    function richTextValuesEqual(left, right) {
        try {
            return stableJson(JSON.parse(normalizeRichTextJson(left)))
                === stableJson(JSON.parse(normalizeRichTextJson(right)));
        } catch {
            return normalizeRichTextJson(left) === normalizeRichTextJson(right);
        }
    }

    function normalizedTagSetKey(tags) {
        return [...new Set(
            normalizeTags(tags)
                .map((item) => tagKey(normalizeNativeTag(item.tag)))
                .filter(Boolean),
        )].sort().join('\n');
    }

    function normalizedDiscoveryVariantKeySetKey(keys) {
        return [...new Set(
            (Array.isArray(keys) ? keys : [])
                .map((key) => String(key || '').trim())
                .filter(Boolean),
        )].sort().join('\n');
    }

    function renderDropdownPresetBar({
        host, label, presets, optionText, selectedPresetId = '',
        saveCurrent, applyPreset, manage, refresh = null,
        showPluginInfo = false, force = false,
    }) {
        const theme = settings.theme === 'dark' ? 'dark' : 'light';
        if (host.dataset.theme !== theme) host.dataset.theme = theme;
        const optionEntries = presets.map((preset) => [preset.id, optionText(preset)]);
        const renderKey = JSON.stringify([
            label,
            optionEntries,
            showPluginInfo ? VERSION : '',
            typeof refresh === 'function',
        ]);
        const currentSelect = host.querySelector('.vtq-preset-select');
        if (
            !force
            && host.dataset.renderKey === renderKey
            && currentSelect
            && currentSelect.options.length === presets.length + 1
        ) {
            currentSelect.value = selectedPresetId || '';
            protectTranslationRoot(host);
            return;
        }
        host.replaceChildren();

        const strip = document.createElement('section');
        strip.className = 'vtq-copy-strip vtq-dropdown-strip';
        if (showPluginInfo) {
            const brand = document.createElement('div');
            brand.className = 'vtq-global-brand';
            const pluginName = document.createElement('span');
            pluginName.className = 'vtq-global-plugin-name';
            pluginName.textContent = 'VGen 快速标签';
            const pluginMeta = document.createElement('span');
            pluginMeta.className = 'vtq-global-plugin-meta';
            pluginMeta.textContent = `by @Nekori_Net · v${VERSION}`;
            brand.append(pluginName, pluginMeta);
            strip.appendChild(brand);
        }
        const row = document.createElement('div');
        row.className = 'vtq-copy-strip-row';

        const text = document.createElement('span');
        text.className = 'vtq-copy-label vtq-dropdown-label';
        text.textContent = label;
        const select = document.createElement('select');
        select.className = 'vtq-preset-select';
        select.setAttribute('aria-label', `选择${label}`);
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = presets.length
            ? `选择预设（${presets.length}）…`
            : '暂无预设';
        placeholder.selected = true;
        select.appendChild(placeholder);
        for (const [presetId, presetText] of optionEntries) {
            const option = document.createElement('option');
            option.value = presetId;
            option.textContent = presetText;
            select.appendChild(option);
        }
        select.value = selectedPresetId || '';
        select.disabled = !presets.length;
        select.addEventListener('change', () => {
            const presetId = select.value;
            if (presetId) applyPreset(presetId, select);
        });

        const actions = document.createElement('div');
        actions.className = 'vtq-copy-strip-actions';
        const add = createButton('＋', 'vtq-copy-action');
        add.title = `把当前内容保存为${label}`;
        add.setAttribute('aria-label', add.title);
        bindImmediateAction(add, saveCurrent);
        const manageButton = createButton('⚙', 'vtq-copy-action');
        manageButton.title = `管理${label}`;
        manageButton.setAttribute('aria-label', manageButton.title);
        bindImmediateAction(manageButton, manage);
        actions.appendChild(add);
        if (typeof refresh === 'function') {
            const refreshButton = createButton('↻', 'vtq-copy-action');
            refreshButton.title = '刷新全部预设';
            refreshButton.setAttribute('aria-label', refreshButton.title);
            bindImmediateAction(refreshButton, () => refresh(refreshButton));
            actions.appendChild(refreshButton);
        }
        actions.appendChild(manageButton);

        row.append(text, select, actions);
        strip.appendChild(row);
        excludeFromTranslation(strip);
        host.appendChild(strip);
        protectTranslationRoot(host);
        host.dataset.renderKey = renderKey;
    }

    function refreshPresetDataFromStorage(triggerButton = null) {
        if (busyPresetModule || busyCopyKind || busyTag) {
            showToast('当前预设操作尚未完成，请稍后再刷新。');
            return;
        }
        if (triggerButton) triggerButton.disabled = true;

        groups = loadGroups();
        copyPresets = loadCopyPresets();
        discoveryPresets = loadDiscoveryPresets();
        globalPresets = loadGlobalPresets();

        renderGroups();
        renderAllManagers();
        const discoveryValues = readCurrentDiscoveryValues(false);
        renderCopyPresetBars(true);
        renderDiscoveryPresetBar(true, discoveryValues);
        renderGlobalPresetBar(true, discoveryValues);
        syncTagButtonStates();
        showToast(
            `已刷新全部预设：全局 ${globalPresets.length}，标题 ${
                copyPresets.title.length
            }，描述 ${copyPresets.description.length}，发现标签 ${
                discoveryPresets.length
            }，搜索标签分类 ${groups.length}。`,
        );
    }

    function getCurrentTextFieldContext(kind) {
        if (!currentSurface?.isConnected || !isSurfaceOpen(currentSurface)) return null;
        const cached = kind === 'title' ? currentTitleContext : currentDescriptionContext;
        if (
            cached?.control?.isConnected
            && isWithinComposedTree(cached.control, currentSurface)
        ) {
            return cached;
        }
        const context = findShowcaseFormContexts(currentBridge, currentSurface)[kind]
            || findTextFieldContext(currentSurface, kind);
        if (kind === 'title') currentTitleContext = context;
        else currentDescriptionContext = context;
        return context;
    }

    function readTextFieldValue(kind, context = getCurrentTextFieldContext(kind)) {
        const showcaseBody = getShowcaseBody();
        if (showcaseBody) {
            return String(kind === 'title' ? showcaseBody.title : showcaseBody.description);
        }
        if (!context?.bridge) return '';
        if (kind === 'description' && context.bridge.editor?.children) {
            try {
                return pageWindow.JSON.stringify(context.bridge.editor.children);
            } catch {
                // 回退到 VGen 父表单当前值。
            }
        }
        return String(context.bridge.value || context.bridge.props?.value || '');
    }

    function saveCurrentTextAsPreset(kind) {
        const context = getCurrentTextFieldContext(kind);
        if (!context && !getShowcaseBody()) {
            showToast('当前作品上传框尚未就绪。');
            return;
        }
        const value = readTextFieldValue(kind, context);
        const preview = kind === 'title' ? value.trim() : descriptionToPlainText(value).trim();
        if (!preview) {
            showToast(`当前${kind === 'title' ? '标题' : '描述'}为空，无法保存预设。`);
            return;
        }

        openModal(kind);
        const card = getCopyEditor(kind);
        const plainText = kind === 'title' ? value : descriptionToPlainText(value);
        pendingCopyPresetValue[kind] = value;
        pendingCopyPresetPlainText[kind] = plainText;
        card.querySelector('.vtq-copy-value-input').value = plainText;
        const nameInput = card.querySelector('.vtq-copy-name-input');
        if (nameInput) {
            nameInput.value = '';
            nameInput.placeholder = `例如：${preview.replace(/\s+/g, ' ').slice(0, 18)}`;
            nameInput.focus();
        } else {
            card.querySelector('.vtq-copy-value-input').focus();
        }
    }

    async function applyCopyPreset(kind, presetId, button) {
        if (busyCopyKind) return;
        const preset = copyPresets[kind].find((item) => item.id === presetId);
        const context = getCurrentTextFieldContext(kind);
        if (!preset || (!context && !getShowcaseBody())) {
            showToast('VGen 对应输入组件尚未就绪。');
            return;
        }

        busyCopyKind = kind;
        button.dataset.state = 'running';
        for (const item of copyHosts[kind]?.querySelectorAll('button, select') || []) {
            item.disabled = true;
        }

        try {
            await commitTextFieldValue(kind, preset.value, context || {
                bridge: { editor: kind === 'description' ? findActiveDescriptionEditor() : null },
            });
            const confirmed = await waitForTextFieldValue(kind, preset.value);
            if (confirmed) {
                showToast(`已填入${kind === 'title' ? '标题' : '描述'}预设“${preset.name}”。`);
            } else {
                showToast('已调用 VGen 表单回调，但页面没有确认新内容。', 4200);
            }
        } catch (error) {
            console.warn('[VGen 快速标签] 文案预设写入失败：', error);
            showToast('VGen 标题或描述组件已经更新，暂时无法写入。', 4200);
        } finally {
            busyCopyKind = '';
            renderCopyPresetBar(kind, true);
        }
    }

    async function commitTextFieldValue(kind, value, context) {
        if (kind === 'title') {
            if (dispatchShowcaseAction({
                type: 'SHOWCASE/UPDATE-TITLE',
                title: String(value),
            })) return;
            const target = new pageWindow.Object();
            target.value = String(value);
            const event = new pageWindow.Object();
            event.target = target;
            event.currentTarget = target;
            await context.bridge.commit(event);
            return;
        }

        const normalized = normalizeRichTextJson(value);
        const editor = (context?.control?.isConnected ? context.bridge?.editor : null)
            || findActiveDescriptionEditor()
            || context?.bridge?.editor;
        if (editor) replaceSlateEditorValue(editor, normalized);
        if (dispatchShowcaseAction({
            type: 'SHOWCASE/UPDATE-DESCRIPTION',
            description: normalized,
        })) return;
        await context.bridge.commit(normalized);
    }

    function findActiveDescriptionEditor() {
        for (const control of deepQueryAll(
            currentSurface,
            '.descriptionEditor, [contenteditable="true"], [data-slate-editor="true"]',
        )) {
            const editor = findSlateEditorFromControl(control);
            if (editor) return editor;
        }
        return null;
    }

    function replaceSlateEditorValue(editor, value) {
        const nextNodes = pageWindow.JSON.parse(value);
        const applyOperations = () => {
            for (let index = editor.children.length - 1; index >= 0; index -= 1) {
                editor.apply({
                    type: 'remove_node',
                    path: createPageArray([index]),
                    node: editor.children[index],
                });
            }
            nextNodes.forEach((node, index) => {
                editor.apply({
                    type: 'insert_node',
                    path: createPageArray([index]),
                    node,
                });
            });
        };

        if (typeof editor.withoutNormalizing === 'function') {
            editor.withoutNormalizing(applyOperations);
        } else {
            applyOperations();
        }
    }

    async function waitForTextFieldValue(kind, expectedValue) {
        const expected = kind === 'description'
            ? normalizeRichTextJson(expectedValue)
            : String(expectedValue);
        for (let attempt = 0; attempt < 32; attempt += 1) {
            await sleep(50);
            if (getShowcaseBody()) {
                const actualValue = readTextFieldValue(kind, null);
                const actual = kind === 'description'
                    ? normalizeRichTextJson(actualValue)
                    : String(actualValue);
                if (actual === expected) return true;
                continue;
            }
            const context = getCurrentTextFieldContext(kind);
            if (!context) continue;
            const actualValue = readTextFieldValue(kind, context);
            const actual = kind === 'description'
                ? normalizeRichTextJson(actualValue)
                : String(actualValue);
            if (actual === expected) return true;
        }
        return false;
    }

    function refreshKnownDiscoveryContext(
        context = currentDiscoveryContext,
        surface = currentSurface,
    ) {
        const fiber = context?.bridge?.fiber;
        if (!fiber || !surface?.isConnected) return null;
        for (const candidate of currentFirstFiberCandidates(fiber)) {
            if (!candidate) continue;
            for (const props of [candidate.memoizedProps, candidate.pendingProps]) {
                const bridge = discoveryBridgeFromProps(candidate, props);
                if (!bridge) continue;
                const refreshed = discoveryContextFromComponent(candidate, bridge, surface);
                if (refreshed) return refreshed;
            }
        }
        return null;
    }

    function getCurrentDiscoveryContext() {
        if (!currentSurface?.isConnected || !isSurfaceOpen(currentSurface)) return null;
        const context = refreshKnownDiscoveryContext()
            || findShowcaseFormContexts(currentBridge, currentSurface).discovery;
        if (context) {
            currentDiscoveryContext = context;
            if (context.schema?.length) {
                currentDiscoverySchema = normalizeDiscoverySchema(context.schema);
            }
        }
        return context;
    }

    function readCurrentDiscoveryValues(refreshContext = true) {
        const context = refreshContext
            ? getCurrentDiscoveryContext()
            : currentDiscoveryContext;
        if (context) return normalizeDiscoveryValues(context.values);
        const showcaseBody = getShowcaseBody();
        return showcaseBody
            ? variantKeysToDiscoveryValues(
                showcaseBody.searchCategoryVariantKeys,
                currentDiscoverySchema,
            )
            : null;
    }

    async function commitDiscoveryValues(values) {
        const normalized = normalizeDiscoveryValues(values);
        const context = getCurrentDiscoveryContext();
        if (context?.bridge) {
            const bridge = context.bridge;
            if (typeof bridge.commitOption !== 'function') {
                throw new Error('Discovery tags 回调不可用');
            }
            const schema = context.schema?.length
                ? context.schema
                : currentDiscoverySchema;
            for (const option of schema) {
                const value = Object.prototype.hasOwnProperty.call(normalized, option.optionID)
                    ? normalized[option.optionID]
                    : option.allowMultipleSelections ? [] : '';
                await bridge.commitOption(option.optionID, clonePageValue(value));
            }
            return waitForDiscoveryValues(normalized);
        }

        // 仅在上传表单尚未挂载时保留 Redux 回退；已打开的 ShowcaseModal 必须
        // 写本地 formValues，否则页面看似成功但保存时仍会提交旧值。
        if (dispatchShowcaseAction({
            type: 'SHOWCASE/SET-SEARCH-CATEGORY-VARIANT-KEYS',
            payload: {
                searchCategoryVariantKeys: discoveryValuesToVariantKeys(normalized),
            },
        })) return waitForDiscoveryValues(normalized);
        throw new Error('Discovery tags 尚未就绪');
    }

    async function waitForDiscoveryValues(expectedValues) {
        const expected = stableJson(normalizeDiscoveryValues(expectedValues));
        for (let attempt = 0; attempt < 32; attempt += 1) {
            await sleep(50);
            const current = getCurrentDiscoveryContext();
            if (current && stableJson(normalizeDiscoveryValues(current.values)) === expected) {
                return true;
            }
            if (!current) {
                const showcaseBody = getShowcaseBody();
                const actual = showcaseBody
                    ? variantKeysToDiscoveryValues(
                        showcaseBody.searchCategoryVariantKeys,
                        currentDiscoverySchema,
                    )
                    : null;
                if (actual && stableJson(normalizeDiscoveryValues(actual)) === expected) {
                    return true;
                }
            }
        }
        return false;
    }

    async function commitExactTags(tags) {
        const normalized = [...new Set(
            normalizeTags(tags).map((item) => normalizeNativeTag(item.tag)),
        )].filter(isValidNativeTag);
        const tagLimit = Number(currentBridge?.tagLimit || SHOWCASE_TAG_LIMIT);
        if (normalized.length > tagLimit) {
            throw new Error(`搜索标签超过 ${tagLimit} 个上限`);
        }
        if (dispatchShowcaseAction({
            type: 'SHOWCASE/SET-TAGS',
            payload: { tags: normalized },
        })) {
            const expectedKey = normalizedTagSetKey(normalized);
            for (let attempt = 0; attempt < 32; attempt += 1) {
                await sleep(50);
                if (normalizedTagSetKey(getShowcaseBody()?.tags || []) === expectedKey) {
                    findTagInput();
                    syncTagButtonStates();
                    return true;
                }
            }
            return false;
        }
        const input = findTagInput();
        const bridge = input ? findTagSearchBridge(input) : null;
        if (!bridge) throw new Error('Search tags 尚未就绪');
        await bridge.onChange(createPageArray(normalized));
        const expected = new Set(normalized.map(tagKey));
        for (let attempt = 0; attempt < 32; attempt += 1) {
            await sleep(50);
            const nextInput = findTagInput();
            const nextBridge = nextInput ? findTagSearchBridge(nextInput) : null;
            if (!nextBridge) continue;
            const actual = new Set(
                nextBridge.initialTags.map((tag) => tagKey(normalizeNativeTag(tag))),
            );
            if (
                actual.size === expected.size
                && [...expected].every((key) => actual.has(key))
            ) {
                currentBridge = nextBridge;
                syncTagButtonStates();
                return true;
            }
        }
        return false;
    }

    async function applyDiscoveryPreset(presetId, button) {
        if (busyPresetModule) return;
        const preset = discoveryPresets.find((item) => item.id === presetId);
        if (!preset) return;
        busyPresetModule = 'discovery';
        button.dataset.state = 'running';
        try {
            const confirmed = await commitDiscoveryValues(preset.values);
            showToast(confirmed
                ? `已应用发现标签预设“${preset.name}”。`
                : '已调用发现标签接口，但 VGen 尚未确认新状态。',
            );
        } catch (error) {
            console.warn('[VGen 快速标签] 发现标签写入失败：', error);
            showToast(error.message || '发现标签写入失败。', 4200);
        } finally {
            busyPresetModule = '';
            syncPresetSelections();
        }
    }

    async function applyGlobalPreset(presetId, button) {
        if (busyPresetModule || busyCopyKind || busyTag) return;
        const preset = globalPresets.find((item) => item.id === presetId);
        if (!preset) return;
        busyPresetModule = 'global';
        button.dataset.state = 'running';
        try {
            const titleContext = getCurrentTextFieldContext('title');
            const descriptionContext = getCurrentTextFieldContext('description');
            const showcaseReady = Boolean(getShowcaseBody());
            if (
                !showcaseReady
                && (!titleContext || !descriptionContext || !getCurrentDiscoveryContext() || !findTagInput())
            ) {
                throw new Error('作品上传窗口的标题、描述、发现标签或搜索标签尚未就绪');
            }
            await commitTextFieldValue('title', preset.title, titleContext || { bridge: {} });
            await commitTextFieldValue('description', preset.description, descriptionContext || {
                bridge: { editor: findActiveDescriptionEditor() },
            });
            await commitDiscoveryValues(preset.discoveryValues);
            const tagsConfirmed = await commitExactTags(preset.tags);
            const [titleConfirmed, descriptionConfirmed, discoveryConfirmed] = await Promise.all([
                waitForTextFieldValue('title', preset.title),
                waitForTextFieldValue('description', preset.description),
                waitForDiscoveryValues(preset.discoveryValues),
            ]);
            if (!titleConfirmed || !descriptionConfirmed || !discoveryConfirmed || !tagsConfirmed) {
                throw new Error('已写入全局预设，但 VGen 未能确认全部字段');
            }
            showToast(`已完整应用全局预设“${preset.name}”。`);
        } catch (error) {
            console.warn('[VGen 快速标签] 全局预设写入失败：', error);
            showToast(error.message || '全局预设写入失败。', 4600);
        } finally {
            busyPresetModule = '';
            syncPresetSelections();
        }
    }

    function saveCurrentDiscoveryAsPreset() {
        const values = readCurrentDiscoveryValues();
        if (!values) {
            showToast('VGen 发现标签组件尚未就绪。');
            return;
        }
        openModal('discovery');
        pendingDiscoveryValues = values;
        renderDiscoveryChoiceEditor(
            '.vtq-discovery-editor-options',
            currentDiscoverySchema,
            values,
            'discovery',
        );
        portal.querySelector('.vtq-discovery-name-input').focus();
    }

    function saveCurrentAsGlobalPreset() {
        const showcaseBody = getShowcaseBody();
        const title = showcaseBody?.title ?? readTextFieldValue('title');
        const description = showcaseBody?.description ?? readTextFieldValue('description');
        const discoveryValues = readCurrentDiscoveryValues();
        const bridge = findTagInput() ? currentBridge : null;
        if (!discoveryValues || (!showcaseBody && !bridge)) {
            showToast('作品上传窗口的发现标签或搜索标签尚未就绪。');
            return;
        }
        const capture = {
            title,
            description,
            discoveryValues,
            discoverySchema: currentDiscoverySchema,
            tags: [...(showcaseBody?.tags || bridge?.initialTags || [])],
        };
        openModal('global');
        pendingGlobalCapture = capture;
        fillGlobalEditor(pendingGlobalCapture);
        portal.querySelector('.vtq-global-name-input').focus();
    }

    function stableJson(value) {
        if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stableJson(item))));
        if (!value || typeof value !== 'object') return JSON.stringify(value);
        const sorted = {};
        for (const key of Object.keys(value).sort()) sorted[key] = value[key];
        return JSON.stringify(sorted);
    }

    function renderGroups() {
        groupsContainer.replaceChildren();

        if (!groups.length) {
            const empty = document.createElement('div');
            empty.className = 'vtq-empty';
            empty.textContent = '暂无标签按钮。点击右上角 ⚙ 新增分类或情景。';
            groupsContainer.appendChild(empty);
            protectPluginUiFromTranslation();
            return;
        }

        groups.forEach((group, groupIndex) => {
            const groupElement = document.createElement('section');
            groupElement.className = 'vtq-group';
            const expanded = settings.groupExpanded?.[group.id] ?? groupIndex === 0;
            groupElement.dataset.expanded = expanded ? 'true' : 'false';

            const heading = document.createElement('div');
            heading.className = 'vtq-group-heading';
            const toggle = createButton('', 'vtq-group-toggle');
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            const chevron = document.createElement('span');
            chevron.className = 'vtq-group-chevron';
            chevron.textContent = '›';
            const name = document.createElement('span');
            name.className = 'vtq-group-name';
            name.textContent = group.name;

            const count = document.createElement('span');
            count.className = 'vtq-group-count';
            count.dataset.groupProgress = group.id;
            count.textContent = `0/${group.tags.length}`;
            toggle.append(chevron, name, count);
            bindImmediateAction(toggle, () => {
                settings.groupExpanded[group.id] = groupElement.dataset.expanded !== 'true';
                saveSettings();
                renderGroups();
            });

            const miniActions = document.createElement('span');
            miniActions.className = 'vtq-group-mini-actions';
            const miniAdd = createButton(
                '＋',
                'vtq-small-button vtq-group-action vtq-group-add vtq-group-mini-action',
            );
            miniAdd.dataset.groupId = group.id;
            miniAdd.title = `全部添加“${group.name}”中尚未使用的标签`;
            bindImmediateAction(
                miniAdd,
                () => executeGroupAction(group.id, 'add', miniAdd),
            );
            const miniRemove = createButton(
                '－',
                'vtq-small-button vtq-group-action vtq-group-remove vtq-group-mini-action',
            );
            miniRemove.dataset.groupId = group.id;
            miniRemove.title = `全部删除“${group.name}”中正在使用的标签`;
            bindImmediateAction(
                miniRemove,
                () => executeGroupAction(group.id, 'remove', miniRemove),
            );
            miniActions.append(miniAdd, miniRemove);
            const progress = document.createElement('span');
            progress.className = 'vtq-group-progress';
            progress.setAttribute('aria-hidden', 'true');
            const progressFill = document.createElement('span');
            progressFill.className = 'vtq-group-progress-fill';
            progressFill.dataset.groupProgressFill = group.id;
            progress.appendChild(progressFill);
            heading.append(toggle, miniActions, progress);

            const toolbar = document.createElement('div');
            toolbar.className = 'vtq-group-toolbar';
            const addAll = createButton(
                '＋ 全部添加',
                'vtq-small-button vtq-group-action vtq-group-add',
            );
            addAll.dataset.groupId = group.id;
            addAll.title = `添加“${group.name}”中尚未使用的全部标签`;
            bindImmediateAction(
                addAll,
                () => executeGroupAction(group.id, 'add', addAll),
            );
            const removeAll = createButton(
                '－ 全部删除',
                'vtq-small-button vtq-group-action vtq-group-remove',
            );
            removeAll.dataset.groupId = group.id;
            removeAll.title = `删除“${group.name}”中当前正在使用的全部标签`;
            bindImmediateAction(
                removeAll,
                () => executeGroupAction(group.id, 'remove', removeAll),
            );
            toolbar.append(addAll, removeAll);

            const tags = document.createElement('div');
            tags.className = 'vtq-tags';

            group.tags.forEach((preset) => {
                const button = createButton('', 'vtq-tag-button');
                const value = document.createElement('span');
                value.className = 'vtq-tag-value';
                value.textContent = preset.tag;
                button.appendChild(value);

                if (preset.note) {
                    const note = document.createElement('span');
                    note.className = 'vtq-tag-note';
                    note.textContent = `【${preset.note}】`;
                    button.appendChild(note);
                }

                button.dataset.tagKey = tagKey(preset.tag);
                button.dataset.tagValue = preset.tag;
                button.dataset.tagNote = preset.note || '';
                button.dataset.state = 'idle';
                button.title = preset.note
                    ? `加入 VGen 标签：${preset.tag}（备注：${preset.note}）`
                    : `加入 VGen 标签：${preset.tag}`;
                bindImmediateAction(button, () => executeTag(preset.tag, button));
                tags.appendChild(button);
            });

            const content = document.createElement('div');
            content.className = 'vtq-group-content';
            content.hidden = !expanded;
            content.append(toolbar, tags);
            groupElement.append(heading, content);
            groupsContainer.appendChild(groupElement);
        });

        syncTagButtonStates();
        protectPluginUiFromTranslation();
    }

    function bindImmediateAction(element, action) {
        let pointerHandledAt = 0;

        element.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            pointerHandledAt = Date.now();
            action(event);
        });

        // 键盘触发或不支持 PointerEvent 的环境仍可使用 click。
        element.addEventListener('click', (event) => {
            if (Date.now() - pointerHandledAt < 700) {
                event.preventDefault();
                return;
            }
            action(event);
        });
    }

    async function executeTag(tag, clickedButton) {
        if (busyTag) return;

        const input = findTagInput();
        const bridge = input ? findTagSearchBridge(input) : null;
        if (!input || !bridge) {
            setStatus('VGen 原生标签组件尚未就绪');
            flashButton(clickedButton, 'failed');
            return;
        }

        const nativeTag = normalizeNativeTag(tag);
        if (!isValidNativeTag(nativeTag)) {
            setStatus(`标签格式不符合 VGen 规则：${tag}`);
            flashButton(clickedButton, 'failed');
            showToast('VGen 标签只能包含英文字母、数字和普通空格，最长 50 个字符。', 4200);
            return;
        }

        currentInput = input;
        currentBridge = bridge;
        busyTag = tag;
        const wasSelected = bridge.initialTags
            .some((item) => tagKey(normalizeNativeTag(item)) === tagKey(nativeTag));
        setAllTagButtonsDisabled(true);
        clickedButton.dataset.state = wasSelected ? 'removing' : 'running';
        setStatus(wasSelected ? `正在删除：${tag}` : `正在添加：${tag}`);

        try {
            const result = await toggleTagThroughNativeState(nativeTag);
            if (result.confirmed && result.action === 'added') {
                clickedButton.dataset.state = 'selected';
                clickedButton.setAttribute('aria-pressed', 'true');
                setStatus(`已由 VGen 原生标签组件添加：${nativeTag}`);
            } else if (result.confirmed && result.action === 'removed') {
                clickedButton.dataset.state = 'idle';
                clickedButton.setAttribute('aria-pressed', 'false');
                setStatus(`已从 VGen 删除：${nativeTag}`);
            } else if (result.limitReached) {
                flashButton(clickedButton, 'failed');
                setStatus(`已达到 VGen 的 ${result.tagLimit} 个标签上限`);
                showToast(`当前作品最多可添加 ${result.tagLimit} 个标签。`);
            } else {
                flashButton(clickedButton, 'failed');
                const actionText = result.action === 'removed' ? '删除' : '添加';
                setStatus(`VGen 没有确认${actionText}：${nativeTag}`);
                showToast(
                    `已调用 VGen 的标签状态回调，但页面没有确认${actionText}“${nativeTag}”。`,
                    4200,
                );
            }
        } catch (error) {
            console.warn('[VGen 快速标签] 原生状态调用失败：', error);
            flashButton(clickedButton, 'failed');
            setStatus(`${wasSelected ? '删除' : '添加'}失败：${nativeTag}`);
            showToast('VGen 标签组件已经更新或暂时不可用，请重新打开上传界面。', 4200);
        } finally {
            busyTag = '';
            setAllTagButtonsDisabled(false);
            syncTagButtonStates();
            window.setTimeout(() => {
                if (!busyTag) setStatus('');
            }, 1500);
        }
    }

    async function executeGroupAction(groupId, action, clickedButton) {
        if (busyTag) return;

        const group = groups.find((item) => item.id === groupId);
        const input = findTagInput();
        const bridge = input ? findTagSearchBridge(input) : null;
        if (!group || !input || !bridge) {
            setStatus('VGen 原生标签组件尚未就绪');
            return;
        }

        currentInput = input;
        currentBridge = bridge;
        busyTag = `group:${groupId}:${action}`;
        setAllTagButtonsDisabled(true);

        const originalText = clickedButton.textContent;
        clickedButton.textContent = action === 'add' ? '添加中…' : '删除中…';
        setStatus(
            action === 'add'
                ? `正在添加“${group.name}”中的标签`
                : `正在删除“${group.name}”中的标签`,
        );

        try {
            const result = await commitGroupActionThroughNativeState(group, action);
            if (!result.confirmed) {
                setStatus(`VGen 没有确认批量${action === 'add' ? '添加' : '删除'}`);
                showToast('已调用 VGen 标签状态回调，但页面没有确认批量操作。', 4200);
            } else if (action === 'add') {
                setStatus(`已添加 ${result.changedCount} 个标签`);
                if (result.skippedCount > 0) {
                    showToast(
                        `已添加 ${result.changedCount} 个；另有 ${result.skippedCount} 个因达到 ${result.tagLimit} 个上限而未添加。`,
                        4600,
                    );
                }
            } else {
                setStatus(`已删除 ${result.changedCount} 个标签`);
            }
        } catch (error) {
            console.warn('[VGen 快速标签] 分类批量操作失败：', error);
            setStatus(`批量${action === 'add' ? '添加' : '删除'}失败`);
            showToast('VGen 标签组件已经更新或暂时不可用，请重新打开上传界面。', 4200);
        } finally {
            clickedButton.textContent = originalText;
            busyTag = '';
            setAllTagButtonsDisabled(false);
            syncTagButtonStates();
            window.setTimeout(() => {
                if (!busyTag) setStatus('');
            }, 1500);
        }
    }

    async function commitGroupActionThroughNativeState(group, action) {
        const input = findTagInput();
        const bridge = input ? findTagSearchBridge(input) : null;
        if (!input || !bridge) return { confirmed: false, changedCount: 0 };

        const groupTags = group.tags
            .map((preset) => normalizeNativeTag(preset.tag))
            .filter(isValidNativeTag);
        const groupKeys = new Set(groupTags.map(tagKey));
        const currentKeys = new Set(
            bridge.initialTags.map((tag) => tagKey(normalizeNativeTag(tag))),
        );

        if (action === 'remove') {
            const removedKeys = [...currentKeys].filter((key) => groupKeys.has(key));
            if (!removedKeys.length) {
                return {
                    confirmed: true,
                    changedCount: 0,
                    skippedCount: 0,
                    tagLimit: bridge.tagLimit,
                };
            }

            const nextTags = createPageArray(
                bridge.initialTags.filter((tag) =>
                    !groupKeys.has(tagKey(normalizeNativeTag(tag))),
                ),
            );
            await bridge.onChange(nextTags);
            return {
                confirmed: await waitForNativeTagKeys(removedKeys, false),
                changedCount: removedKeys.length,
                skippedCount: 0,
                tagLimit: bridge.tagLimit,
            };
        }

        const missingTags = groupTags.filter((tag) => !currentKeys.has(tagKey(tag)));
        const availableSlots = Math.max(0, bridge.tagLimit - bridge.initialTags.length);
        const tagsToAdd = missingTags.slice(0, availableSlots);
        const skippedCount = missingTags.length - tagsToAdd.length;

        if (!tagsToAdd.length) {
            return {
                confirmed: true,
                changedCount: 0,
                skippedCount,
                tagLimit: bridge.tagLimit,
            };
        }

        const nextTags = createPageArray(bridge.initialTags);
        nextTags.push(...tagsToAdd);
        await bridge.onChange(nextTags);
        return {
            confirmed: await waitForNativeTagKeys(tagsToAdd.map(tagKey), true),
            changedCount: tagsToAdd.length,
            skippedCount,
            tagLimit: bridge.tagLimit,
        };
    }

    async function toggleTagThroughNativeState(tag) {
        const input = findTagInput();
        const bridge = input ? findTagSearchBridge(input) : null;
        if (!input || !bridge) return { confirmed: false };

        const key = tagKey(tag);
        const existingIndex = bridge.initialTags.findIndex((item) =>
            tagKey(normalizeNativeTag(item)) === key,
        );

        if (existingIndex >= 0) {
            const nextTags = createPageArray(
                bridge.initialTags.filter((item, index) => index !== existingIndex),
            );
            await bridge.onChange(nextTags);
            return {
                action: 'removed',
                confirmed: await waitForNativeTagState(tag, false),
                limitReached: false,
                tagLimit: bridge.tagLimit,
            };
        }

        if (bridge.initialTags.length >= bridge.tagLimit) {
            return {
                action: 'added',
                confirmed: false,
                limitReached: true,
                tagLimit: bridge.tagLimit,
            };
        }

        const nextTags = createPageArray(bridge.initialTags);
        nextTags.push(tag);
        await bridge.onChange(nextTags);

        return {
            action: 'added',
            confirmed: await waitForNativeTagState(tag, true),
            limitReached: false,
            tagLimit: bridge.tagLimit,
        };
    }

    async function waitForNativeTagState(tag, shouldExist) {
        return waitForNativeTagKeys([tagKey(tag)], shouldExist);
    }

    async function waitForNativeTagKeys(keys, shouldExist) {
        const expectedKeys = [...new Set(keys)];
        for (let attempt = 0; attempt < 32; attempt += 1) {
            await sleep(50);
            const input = findTagInput();
            const bridge = input ? findTagSearchBridge(input) : null;
            if (!bridge) continue;

            currentInput = input;
            currentBridge = bridge;
            const selectedKeys = new Set(
                bridge.initialTags.map((item) => tagKey(normalizeNativeTag(item))),
            );
            const confirmed = expectedKeys.every((key) =>
                selectedKeys.has(key) === shouldExist,
            );
            if (confirmed) return true;
        }
        return false;
    }

    function createPageArray(values) {
        try {
            return pageWindow.Array.from(values);
        } catch {
            return Array.from(values);
        }
    }

    function normalizeNativeTag(tag) {
        return String(tag || '')
            .trim()
            .replace(/ {2,}/g, ' ')
            .toLocaleLowerCase();
    }

    function isValidNativeTag(tag) {
        return Boolean(
            tag
            && tag.length <= MAX_TAG_LENGTH
            && /^[a-z0-9]+(?: [a-z0-9]+)*$/.test(tag),
        );
    }

    function setAllTagButtonsDisabled(disabled) {
        for (const button of panel.querySelectorAll('.vtq-tag-button, .vtq-group-action')) {
            button.disabled = disabled;
            if (
                !disabled
                && ['running', 'removing'].includes(button.dataset.state)
            ) {
                button.dataset.state = 'idle';
            }
        }
    }

    function flashButton(button, state) {
        button.dataset.state = state;
        window.setTimeout(() => {
            if (button.isConnected && button.dataset.state === state) {
                syncTagButtonStates();
            }
        }, 1100);
    }

    function syncTagButtonStates() {
        if (!panel) return;
        const selected = new Set(
            (currentBridge?.initialTags || []).map((tag) => tagKey(normalizeNativeTag(tag))),
        );

        for (const button of panel.querySelectorAll('.vtq-tag-button')) {
            if (
                busyTag
                && ['running', 'removing'].includes(button.dataset.state)
            ) {
                continue;
            }
            const isSelected = selected.has(button.dataset.tagKey);
            const state = isSelected ? 'selected' : 'idle';
            const pressed = isSelected ? 'true' : 'false';
            if (button.dataset.state !== state) button.dataset.state = state;
            if (button.getAttribute('aria-pressed') !== pressed) {
                button.setAttribute('aria-pressed', pressed);
            }
            const tag = button.dataset.tagValue || button.dataset.tagKey;
            const note = button.dataset.tagNote;
            const noteText = note ? `（备注：${note}）` : '';
            const title = isSelected
                ? `从 VGen 删除标签：${tag}${noteText}`
                : `加入 VGen 标签：${tag}${noteText}`;
            if (button.title !== title) button.title = title;
            if (button.getAttribute('aria-label') !== title) button.setAttribute('aria-label', title);
        }

        for (const button of panel.querySelectorAll('.vtq-group-action')) {
            const group = groups.find((item) => item.id === button.dataset.groupId);
            const groupKeys = new Set(
                (group?.tags || [])
                    .map((preset) => normalizeNativeTag(preset.tag))
                    .filter(isValidNativeTag)
                    .map(tagKey),
            );
            const selectedCount = [...groupKeys]
                .filter((key) => selected.has(key)).length;
            const allSelected = groupKeys.size > 0 && selectedCount === groupKeys.size;
            const noneSelected = selectedCount === 0;

            let disabled;
            if (button.classList.contains('vtq-group-add')) {
                disabled = Boolean(busyTag)
                    || allSelected
                    || selected.size >= (currentBridge?.tagLimit || SHOWCASE_TAG_LIMIT);
            } else {
                disabled = Boolean(busyTag) || noneSelected;
            }
            if (button.disabled !== disabled) button.disabled = disabled;

            const count = [...panel.querySelectorAll('[data-group-progress]')]
                .find((element) => element.dataset.groupProgress === group.id);
            const fill = [...panel.querySelectorAll('[data-group-progress-fill]')]
                .find((element) => element.dataset.groupProgressFill === group.id);
            const countText = `${selectedCount}/${groupKeys.size}`;
            if (count && count.textContent !== countText) count.textContent = countText;
            if (fill) {
                const width = groupKeys.size
                    ? `${Math.round((selectedCount / groupKeys.size) * 100)}%`
                    : '0%';
                if (fill.style.width !== width) fill.style.width = width;
            }
        }
    }

    function setStatus(text) {
        if (statusText) statusText.textContent = text;
    }

    function openModal(sectionKind = 'tags') {
        resetEditor();
        resetCopyPresetEditors();
        resetDiscoveryPresetEditor();
        resetGlobalPresetEditor();
        renderAllManagers();
        modal.dataset.open = 'true';
        setSettingsSectionOpen(sectionKind, true, true);
    }

    function closeModal() {
        modal.dataset.open = 'false';
        resetEditor();
        resetCopyPresetEditors();
        resetDiscoveryPresetEditor();
        resetGlobalPresetEditor();
    }

    function setSettingsSectionOpen(kind, open, exclusive = false) {
        for (const section of portal.querySelectorAll('.vtq-settings-accordion')) {
            const isTarget = section.dataset.settingsSection === kind;
            const nextOpen = isTarget ? open : exclusive ? false : section.dataset.open === 'true';
            section.dataset.open = nextOpen ? 'true' : 'false';
            section.querySelector('.vtq-settings-accordion-toggle')
                ?.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
            const body = section.querySelector('.vtq-settings-accordion-body');
            if (body) body.hidden = !nextOpen;
        }
        if (open) {
            window.setTimeout(() => {
                portal.querySelector(`[data-settings-section="${kind}"]`)
                    ?.scrollIntoView?.({ block: 'nearest' });
            }, 0);
        }
    }

    function renderAllManagers() {
        renderManager();
        renderCopyPresetManager();
        renderDiscoveryPresetManager();
        renderGlobalPresetManager();
        renderDiscoveryEditors();
        renderGlobalSourceSelectors();
        protectPluginUiFromTranslation();
    }

    function renderManager() {
        const container = portal.querySelector('.vtq-manage-items');
        container.replaceChildren();

        if (!groups.length) {
            const empty = document.createElement('div');
            empty.className = 'vtq-empty';
            empty.textContent = '暂无已保存预设';
            container.appendChild(empty);
            excludeFromTranslation(container);
            return;
        }

        groups.forEach((group) => {
            const item = document.createElement('div');
            item.className = 'vtq-manage-item';
            item.dataset.groupId = group.id;

            const handle = createButton('', 'vtq-drag-handle');
            handle.title = '按住拖动排序';
            handle.setAttribute('aria-label', `拖动“${group.name}”排序`);
            for (let dotIndex = 0; dotIndex < 6; dotIndex += 1) {
                const dot = document.createElement('span');
                dot.className = 'vtq-drag-dot';
                handle.appendChild(dot);
            }

            const text = document.createElement('div');
            text.className = 'vtq-item-text';
            const name = document.createElement('span');
            name.className = 'vtq-item-name';
            name.textContent = group.name;
            const tags = document.createElement('span');
            tags.className = 'vtq-item-tags';
            const tagSummary = group.tags.map(formatTagPreset).join(', ');
            tags.textContent = tagSummary;
            tags.title = tagSummary;
            text.append(name, tags);

            const actions = document.createElement('div');
            actions.className = 'vtq-row-actions';
            const edit = createButton('编辑', 'vtq-small-button');
            edit.addEventListener('click', () => editGroup(group.id));
            const remove = createButton('删除', 'vtq-small-button');
            remove.addEventListener('click', () => deleteGroup(group.id));
            actions.append(edit, remove);

            item.append(handle, text, actions);
            container.appendChild(item);
        });
        excludeFromTranslation(container);
    }

    function renderCopyPresetManager() {
        if (!portal) return;
        for (const kind of ['title', 'description']) {
            const card = portal.querySelector(`[data-settings-section="${kind}"]`);
            const container = card?.querySelector('.vtq-copy-manage-items');
            if (!container) continue;
            container.replaceChildren();
            const presets = copyPresets[kind] || [];

            if (!presets.length) {
                const empty = document.createElement('div');
                empty.className = 'vtq-empty';
                empty.textContent = '暂无预设';
                container.appendChild(empty);
                continue;
            }

            for (const preset of presets) {
                const item = document.createElement('div');
                item.className = 'vtq-copy-manage-item';
                const text = document.createElement('div');
                text.className = 'vtq-copy-manage-text';
                const name = document.createElement('span');
                name.className = 'vtq-copy-manage-name';
                name.textContent = kind === 'title' ? preset.value : preset.name;
                const preview = document.createElement('span');
                preview.className = 'vtq-copy-manage-preview';
                preview.textContent = kind === 'title'
                    ? (preset.note
                        ? `注释：${preset.note}`
                        : '无注释 · 选择时只填入标题内容')
                    : descriptionToPlainText(preset.value);
                preview.title = preview.textContent;
                text.append(name, preview);

                const actions = document.createElement('div');
                actions.className = 'vtq-row-actions';
                const edit = createButton('编辑', 'vtq-small-button');
                edit.addEventListener('click', () => editCopyPreset(kind, preset.id));
                const remove = createButton('删除', 'vtq-small-button');
                remove.addEventListener('click', () => deleteCopyPreset(kind, preset.id));
                actions.append(edit, remove);
                item.append(text, actions);
                container.appendChild(item);
            }
            excludeFromTranslation(container);
        }
    }

    function saveCopyPresetFromManager(kind) {
        const card = getCopyEditor(kind);
        const nameInput = card?.querySelector('.vtq-copy-name-input');
        const valueInput = card?.querySelector('.vtq-copy-value-input');
        const noteInput = card?.querySelector('.vtq-copy-note-input');
        const plainValue = String(valueInput?.value || '');
        const note = kind === 'title'
            ? String(noteInput?.value || '').trim().slice(0, 80)
            : '';
        const name = kind === 'title'
            ? plainValue.trim().slice(0, 60)
            : String(nameInput?.value || '').trim().slice(0, 60);
        const editingId = editingCopyPresetId[kind];
        const canReuseCapturedRichValue = !editingId
            && pendingCopyPresetValue[kind]
            && plainValue === pendingCopyPresetPlainText[kind];
        const value = kind === 'description'
            ? (canReuseCapturedRichValue
                ? pendingCopyPresetValue[kind]
                : plainTextToDescriptionJson(plainValue))
            : plainValue.trim();

        if (kind === 'description' && !name) {
            showToast('请填写预设名称。');
            nameInput?.focus();
            return;
        }
        if (kind === 'title' ? !value : !descriptionToPlainText(value).trim()) {
            showToast(`请填写${kind === 'title' ? '标题' : '描述'}内容。`);
            valueInput?.focus();
            return;
        }

        if (editingId) {
            const preset = copyPresets[kind].find((item) => item.id === editingId);
            if (!preset) return;
            preset.name = name;
            preset.value = value;
            if (kind === 'title') preset.note = note;
            showToast(`已更新“${name}”。`);
        } else {
            copyPresets[kind].push({ id: makeId(), name, value, ...(kind === 'title' ? { note } : {}) });
            showToast(`已新增“${name}”。`);
        }

        persistCopyPresets();
        resetCopyPresetEditor(kind);
        renderCopyPresetManager();
        renderCopyPresetBars();
        renderGlobalSourceSelectors();
    }

    function editCopyPreset(kind, id) {
        const preset = copyPresets[kind].find((item) => item.id === id);
        const card = getCopyEditor(kind);
        if (!preset || !card) return;
        editingCopyPresetId[kind] = id;
        const nameInput = card.querySelector('.vtq-copy-name-input');
        if (nameInput) nameInput.value = preset.name;
        const noteInput = card.querySelector('.vtq-copy-note-input');
        if (noteInput) noteInput.value = preset.note || '';
        card.querySelector('.vtq-copy-value-input').value = kind === 'title'
            ? preset.value
            : descriptionToPlainText(preset.value);
        card.querySelector('.vtq-copy-save').textContent = '保存修改';
        card.querySelector('.vtq-copy-cancel-edit').hidden = false;
        (nameInput || card.querySelector('.vtq-copy-value-input')).focus();
    }

    function resetCopyPresetEditor(kind) {
        const card = getCopyEditor(kind);
        if (!card) return;
        editingCopyPresetId[kind] = null;
        pendingCopyPresetValue[kind] = null;
        pendingCopyPresetPlainText[kind] = '';
        const nameInput = card.querySelector('.vtq-copy-name-input');
        if (nameInput) nameInput.value = '';
        const noteInput = card.querySelector('.vtq-copy-note-input');
        if (noteInput) noteInput.value = '';
        card.querySelector('.vtq-copy-value-input').value = '';
        if (nameInput) nameInput.placeholder = '例如：常用授权说明';
        card.querySelector('.vtq-copy-save').textContent = kind === 'title'
            ? '新增标题预设'
            : '新增描述预设';
        card.querySelector('.vtq-copy-cancel-edit').hidden = true;
    }

    function getCopyEditor(kind) {
        return portal.querySelector(
            `[data-settings-section="${kind}"] [data-copy-kind="${kind}-editor"]`,
        );
    }

    function resetCopyPresetEditors() {
        resetCopyPresetEditor('title');
        resetCopyPresetEditor('description');
    }

    function deleteCopyPreset(kind, id) {
        const preset = copyPresets[kind].find((item) => item.id === id);
        const displayName = kind === 'title' ? formatTitlePresetLabel(preset) : preset?.name;
        if (!preset || !window.confirm(`确定删除“${displayName}”吗？`)) return;
        copyPresets[kind] = copyPresets[kind].filter((item) => item.id !== id);
        persistCopyPresets();
        resetCopyPresetEditor(kind);
        renderCopyPresetManager();
        renderCopyPresetBars();
        renderGlobalSourceSelectors();
        showToast(`已删除“${displayName}”。`);
    }

    function renderDiscoveryEditors() {
        const fallbackPreset = discoveryPresets[0] || globalPresets[0];
        const schema = currentDiscoverySchema.length
            ? currentDiscoverySchema
            : normalizeDiscoverySchema(
                fallbackPreset?.schema || fallbackPreset?.discoverySchema,
            );
        const currentValues = readCurrentDiscoveryValues()
            || pendingDiscoveryValues
            || normalizeDiscoveryValues(fallbackPreset?.values || fallbackPreset?.discoveryValues);
        renderDiscoveryChoiceEditor(
            '.vtq-discovery-editor-options', schema, currentValues, 'discovery',
        );
        renderDiscoveryChoiceEditor(
            '.vtq-global-discovery-options',
            globalEditorDiscoverySchema.length ? globalEditorDiscoverySchema : schema,
            pendingGlobalCapture?.discoveryValues || currentValues, 'global',
        );
    }

    function renderGlobalSourceSelectors() {
        if (!portal) return;
        const configs = [
            {
                kind: 'title',
                label: '标题预设',
                presets: copyPresets.title,
                optionText: formatTitlePresetLabel,
            },
            {
                kind: 'description',
                label: '描述预设',
                presets: copyPresets.description,
                optionText: (preset) => preset.name,
            },
            {
                kind: 'discovery',
                label: '发现标签预设',
                presets: discoveryPresets,
                optionText: (preset) => preset.name,
            },
            {
                kind: 'tags',
                label: '搜索标签分类',
                presets: groups,
                optionText: (preset) => preset.name,
            },
        ];

        for (const config of configs) {
            const select = portal.querySelector(`[data-global-source="${config.kind}"]`);
            if (!select) continue;
            select.replaceChildren();
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = config.presets.length
                ? `从已保存${config.label}选择（${config.presets.length}）…`
                : `暂无已保存${config.label}`;
            select.appendChild(placeholder);
            for (const preset of config.presets) {
                const option = document.createElement('option');
                option.value = preset.id;
                option.textContent = config.optionText(preset);
                select.appendChild(option);
            }
            select.disabled = !config.presets.length;
        }
        syncGlobalSourceSelections();
        excludeFromTranslation(portal);
    }

    function applyGlobalSourcePreset(select) {
        const kind = select?.dataset.globalSource;
        const presetId = select?.value;
        if (!kind || !presetId) return;

        if (kind === 'title') {
            const preset = copyPresets.title.find((item) => item.id === presetId);
            if (preset) portal.querySelector('.vtq-global-title-input').value = preset.value;
        } else if (kind === 'description') {
            const preset = copyPresets.description.find((item) => item.id === presetId);
            if (preset) {
                portal.querySelector('.vtq-global-description-input').value =
                    descriptionToPlainText(preset.value);
            }
        } else if (kind === 'discovery') {
            const preset = discoveryPresets.find((item) => item.id === presetId);
            if (preset) {
                globalEditorDiscoverySchema = normalizeDiscoverySchema(preset.schema);
                renderDiscoveryChoiceEditor(
                    '.vtq-global-discovery-options',
                    globalEditorDiscoverySchema,
                    preset.values,
                    'global',
                );
            }
        } else if (kind === 'tags') {
            const preset = groups.find((item) => item.id === presetId);
            if (preset) {
                portal.querySelector('.vtq-global-tags-input').value = normalizeTags(preset.tags)
                    .map((item) => item.tag).join('\n');
            }
        }
        syncGlobalSourceSelections();
    }

    function syncGlobalSourceSelections() {
        if (!portal) return;
        const titleValue = portal.querySelector('.vtq-global-title-input')?.value.trim() || '';
        const descriptionValue = portal.querySelector('.vtq-global-description-input')?.value || '';
        const discoveryValue = readDiscoveryEditorValues('.vtq-global-discovery-options');
        const tagsValue = portal.querySelector('.vtq-global-tags-input')?.value || '';
        const matches = {
            title: copyPresets.title.find((preset) => preset.value === titleValue)?.id || '',
            description: copyPresets.description.find((preset) =>
                descriptionToPlainText(preset.value) === descriptionValue,
            )?.id || '',
            discovery: discoveryPresets.find((preset) =>
                stableJson(normalizeDiscoveryValues(preset.values))
                    === stableJson(normalizeDiscoveryValues(discoveryValue)),
            )?.id || '',
            tags: groups.find((group) =>
                normalizedTagSetKey(group.tags) === normalizedTagSetKey(tagsValue),
            )?.id || '',
        };
        for (const [kind, presetId] of Object.entries(matches)) {
            const select = portal.querySelector(`[data-global-source="${kind}"]`);
            if (select) select.value = presetId;
        }
    }

    function renderDiscoveryChoiceEditor(selector, schema, values, scopeName) {
        const container = portal.querySelector(selector);
        if (!container) return;
        container.replaceChildren();
        const normalizedSchema = normalizeDiscoverySchema(schema);
        const normalizedValues = normalizeDiscoveryValues(values);
        if (!normalizedSchema.length) {
            const empty = document.createElement('div');
            empty.className = 'vtq-empty';
            empty.textContent = '请先打开一次作品上传窗口，让插件读取 VGen 当前的发现标签选项。';
            container.appendChild(empty);
            excludeFromTranslation(container);
            return;
        }

        for (const option of normalizedSchema) {
            const group = document.createElement('section');
            group.className = 'vtq-native-choice-group';
            const label = document.createElement('span');
            label.className = 'vtq-native-choice-label';
            label.textContent = option.label;
            const options = document.createElement('div');
            options.className = 'vtq-native-choice-options';
            const selectedValue = normalizedValues[option.optionID];
            const selectedSet = new Set(
                Array.isArray(selectedValue) ? selectedValue : [selectedValue].filter(Boolean),
            );
            for (const variant of option.variants) {
                const choice = document.createElement('label');
                choice.className = 'vtq-native-choice';
                const input = document.createElement('input');
                input.type = option.allowMultipleSelections ? 'checkbox' : 'radio';
                input.name = `vtq-${scopeName}-${option.optionID}`;
                input.value = variant.variantID;
                input.checked = selectedSet.has(variant.variantID);
                input.dataset.optionId = option.optionID;
                input.dataset.multiple = option.allowMultipleSelections ? 'true' : 'false';
                choice.append(input, document.createTextNode(variant.label));
                options.appendChild(choice);
            }
            group.append(label, options);
            container.appendChild(group);
        }
        excludeFromTranslation(container);
    }

    function readDiscoveryEditorValues(selector) {
        const container = portal.querySelector(selector);
        const result = {};
        if (!container) return result;
        const inputs = [...container.querySelectorAll('input[data-option-id]')];
        for (const input of inputs) {
            const optionID = input.dataset.optionId;
            if (input.dataset.multiple === 'true') {
                result[optionID] ||= [];
                if (input.checked) result[optionID].push(input.value);
            } else if (input.checked) {
                result[optionID] = input.value;
            }
        }
        return normalizeDiscoveryValues(result);
    }

    function renderDiscoveryPresetManager() {
        const container = portal.querySelector('.vtq-discovery-manage-items');
        if (!container) return;
        renderNamedPresetManager(container, discoveryPresets, {
            preview: (preset) => discoveryPresetPreview(preset),
            edit: (id) => editDiscoveryPreset(id),
            remove: (id) => deleteDiscoveryPreset(id),
        });
        excludeFromTranslation(container);
    }

    function renderGlobalPresetManager() {
        const container = portal.querySelector('.vtq-global-manage-items');
        if (!container) return;
        renderNamedPresetManager(container, globalPresets, {
            preview: (preset) => `${preset.title || '无标题'} · ${preset.tags.length} 个搜索标签`,
            edit: (id) => editGlobalPreset(id),
            remove: (id) => deleteGlobalPreset(id),
        });
        excludeFromTranslation(container);
    }

    function renderNamedPresetManager(container, presets, actionsConfig) {
        container.replaceChildren();
        if (!presets.length) {
            const empty = document.createElement('div');
            empty.className = 'vtq-empty';
            empty.textContent = '暂无预设';
            container.appendChild(empty);
            return;
        }
        for (const preset of presets) {
            const item = document.createElement('div');
            item.className = 'vtq-copy-manage-item';
            const text = document.createElement('div');
            text.className = 'vtq-copy-manage-text';
            const name = document.createElement('span');
            name.className = 'vtq-copy-manage-name';
            name.textContent = preset.name;
            const preview = document.createElement('span');
            preview.className = 'vtq-copy-manage-preview';
            preview.textContent = actionsConfig.preview(preset);
            text.append(name, preview);
            const actions = document.createElement('div');
            actions.className = 'vtq-row-actions';
            const edit = createButton('编辑', 'vtq-small-button');
            edit.addEventListener('click', () => actionsConfig.edit(preset.id));
            const remove = createButton('删除', 'vtq-small-button');
            remove.addEventListener('click', () => actionsConfig.remove(preset.id));
            actions.append(edit, remove);
            item.append(text, actions);
            container.appendChild(item);
        }
    }

    function discoveryPresetPreview(preset) {
        const schema = normalizeDiscoverySchema(preset.schema);
        const values = normalizeDiscoveryValues(preset.values);
        const labels = [];
        for (const option of schema) {
            const selected = Array.isArray(values[option.optionID])
                ? values[option.optionID]
                : [values[option.optionID]].filter(Boolean);
            for (const id of selected) {
                labels.push(option.variants.find((variant) => variant.variantID === id)?.label || id);
            }
        }
        return labels.join('、') || '未选择';
    }

    function saveDiscoveryPresetFromManager() {
        const nameInput = portal.querySelector('.vtq-discovery-name-input');
        const name = nameInput.value.trim().slice(0, 60);
        const schema = currentDiscoverySchema.length
            ? currentDiscoverySchema
            : normalizeDiscoverySchema(
                discoveryPresets.find((item) => item.id === editingDiscoveryPresetId)?.schema,
            );
        const values = readDiscoveryEditorValues('.vtq-discovery-editor-options');
        if (!name) {
            showToast('请填写发现标签预设标题。');
            nameInput.focus();
            return;
        }
        if (!schema.length || !discoveryValuesComplete(schema, values)) {
            showToast('发现标签选项尚未就绪，或没有选择任何选项。');
            return;
        }
        const existing = discoveryPresets.find((item) => item.id === editingDiscoveryPresetId);
        if (existing) Object.assign(existing, { name, schema, values });
        else discoveryPresets.push({ id: makeId(), name, schema, values });
        persistDiscoveryPresets();
        resetDiscoveryPresetEditor();
        renderDiscoveryPresetManager();
        renderDiscoveryPresetBar();
        renderGlobalSourceSelectors();
        showToast(existing ? `已更新“${name}”。` : `已新增“${name}”。`);
    }

    function editDiscoveryPreset(id) {
        const preset = discoveryPresets.find((item) => item.id === id);
        if (!preset) return;
        editingDiscoveryPresetId = id;
        portal.querySelector('.vtq-discovery-editor-title').textContent = '编辑发现标签预设';
        portal.querySelector('.vtq-discovery-name-input').value = preset.name;
        portal.querySelector('.vtq-discovery-save').textContent = '保存修改';
        portal.querySelector('.vtq-discovery-cancel-edit').hidden = false;
        renderDiscoveryChoiceEditor(
            '.vtq-discovery-editor-options', preset.schema, preset.values, 'discovery',
        );
    }

    function resetDiscoveryPresetEditor() {
        editingDiscoveryPresetId = null;
        pendingDiscoveryValues = null;
        const name = portal?.querySelector('.vtq-discovery-name-input');
        if (!name) return;
        name.value = '';
        portal.querySelector('.vtq-discovery-editor-title').textContent = '新增发现标签预设';
        portal.querySelector('.vtq-discovery-save').textContent = '新增发现标签预设';
        portal.querySelector('.vtq-discovery-cancel-edit').hidden = true;
        renderDiscoveryEditors();
    }

    function deleteDiscoveryPreset(id) {
        const preset = discoveryPresets.find((item) => item.id === id);
        if (!preset || !window.confirm(`确定删除“${preset.name}”吗？`)) return;
        discoveryPresets = discoveryPresets.filter((item) => item.id !== id);
        persistDiscoveryPresets();
        renderDiscoveryPresetManager();
        renderDiscoveryPresetBar();
        renderGlobalSourceSelectors();
    }

    function fillGlobalEditor(preset) {
        if (!preset) return;
        portal.querySelector('.vtq-global-title-input').value = preset.title || '';
        portal.querySelector('.vtq-global-description-input').value =
            descriptionToPlainText(preset.description || DEFAULT_RICH_TEXT);
        portal.querySelector('.vtq-global-tags-input').value =
            normalizeTags(preset.tags || []).map((item) => item.tag).join('\n');
        globalEditorDiscoverySchema = normalizeDiscoverySchema(
            preset.discoverySchema || currentDiscoverySchema,
        );
        renderDiscoveryChoiceEditor(
            '.vtq-global-discovery-options',
            globalEditorDiscoverySchema,
            preset.discoveryValues,
            'global',
        );
        renderGlobalSourceSelectors();
    }

    function saveGlobalPresetFromManager() {
        const nameInput = portal.querySelector('.vtq-global-name-input');
        const name = nameInput.value.trim().slice(0, 60);
        const title = portal.querySelector('.vtq-global-title-input').value.trim();
        const description = plainTextToDescriptionJson(
            portal.querySelector('.vtq-global-description-input').value,
        );
        const tags = normalizeTags(portal.querySelector('.vtq-global-tags-input').value);
        const discoveryValues = readDiscoveryEditorValues('.vtq-global-discovery-options');
        const existing = globalPresets.find((item) => item.id === editingGlobalPresetId);
        const discoverySchema = globalEditorDiscoverySchema.length
            ? globalEditorDiscoverySchema
            : currentDiscoverySchema.length
                ? currentDiscoverySchema
                : normalizeDiscoverySchema(
                    existing?.discoverySchema || pendingGlobalCapture?.discoverySchema,
                );
        if (!name || !title) {
            showToast('请填写全局预设标题和 Title。');
            (!name ? nameInput : portal.querySelector('.vtq-global-title-input')).focus();
            return;
        }
        if (!discoverySchema.length || !discoveryValuesComplete(discoverySchema, discoveryValues)) {
            showToast('请完整选择 Discovery tags。');
            return;
        }
        if (tags.length > SHOWCASE_TAG_LIMIT) {
            showToast(`Search tags 最多 ${SHOWCASE_TAG_LIMIT} 个。`);
            return;
        }
        const invalid = tags.find((item) => !isValidNativeTag(normalizeNativeTag(item.tag)));
        if (invalid) {
            showToast(`搜索标签“${invalid.tag}”不符合 VGen 规则。`);
            return;
        }
        const next = {
            name, title, description, discoverySchema,
            discoveryValues,
            tags: tags.map((item) => normalizeNativeTag(item.tag)),
        };
        if (existing) Object.assign(existing, next);
        else globalPresets.push({ id: makeId(), ...next });
        persistGlobalPresets();
        resetGlobalPresetEditor();
        renderGlobalPresetManager();
        renderGlobalPresetBar();
        showToast(existing ? `已更新“${name}”。` : `已新增“${name}”。`);
    }

    function editGlobalPreset(id) {
        const preset = globalPresets.find((item) => item.id === id);
        if (!preset) return;
        editingGlobalPresetId = id;
        portal.querySelector('.vtq-global-editor-title').textContent = '编辑全局预设';
        portal.querySelector('.vtq-global-name-input').value = preset.name;
        portal.querySelector('.vtq-global-save').textContent = '保存修改';
        portal.querySelector('.vtq-global-cancel-edit').hidden = false;
        fillGlobalEditor(preset);
    }

    function resetGlobalPresetEditor() {
        editingGlobalPresetId = null;
        pendingGlobalCapture = null;
        if (!portal?.querySelector('.vtq-global-name-input')) return;
        portal.querySelector('.vtq-global-name-input').value = '';
        portal.querySelector('.vtq-global-title-input').value = '';
        portal.querySelector('.vtq-global-description-input').value = '';
        portal.querySelector('.vtq-global-tags-input').value = '';
        globalEditorDiscoverySchema = currentDiscoverySchema.length
            ? normalizeDiscoverySchema(currentDiscoverySchema)
            : normalizeDiscoverySchema(
                discoveryPresets[0]?.schema || globalPresets[0]?.discoverySchema,
            );
        portal.querySelector('.vtq-global-editor-title').textContent = '新增全局预设';
        portal.querySelector('.vtq-global-save').textContent = '新增全局预设';
        portal.querySelector('.vtq-global-cancel-edit').hidden = true;
        renderDiscoveryEditors();
        renderGlobalSourceSelectors();
    }

    function deleteGlobalPreset(id) {
        const preset = globalPresets.find((item) => item.id === id);
        if (!preset || !window.confirm(`确定删除“${preset.name}”吗？`)) return;
        globalPresets = globalPresets.filter((item) => item.id !== id);
        persistGlobalPresets();
        renderGlobalPresetManager();
        renderGlobalPresetBar();
    }

    function saveEditedGroup() {
        const nameInput = portal.querySelector('.vtq-name-input');
        const tagsInput = portal.querySelector('.vtq-tags-input');
        const name = nameInput.value.trim();
        const tags = parseTags(tagsInput.value);

        if (!name) {
            showToast('请填写分类 / 情景名称。');
            nameInput.focus();
            return;
        }
        if (!tags.length) {
            showToast('请至少填写一个标签按钮。');
            tagsInput.focus();
            return;
        }
        const invalidTag = tags.find((preset) =>
            !isValidNativeTag(normalizeNativeTag(preset.tag)),
        );
        if (invalidTag) {
            showToast(
                `“${invalidTag.tag}”不符合 VGen 标签规则：仅支持英文字母、数字和普通空格。`,
                4200,
            );
            tagsInput.focus();
            return;
        }

        if (editingGroupId) {
            const group = groups.find((item) => item.id === editingGroupId);
            if (!group) return;
            group.name = name;
            group.tags = tags;
            showToast(`已更新“${name}”。`);
        } else {
            groups.push({ id: makeId(), name, tags });
            showToast(`已新增“${name}”。`);
        }

        persistGroups();
        resetEditor();
        renderGroups();
        renderManager();
        renderGlobalSourceSelectors();
    }

    function editGroup(id) {
        const group = groups.find((item) => item.id === id);
        if (!group) return;
        editingGroupId = id;
        portal.querySelector('.vtq-editor-title').textContent = '编辑分类 / 情景';
        portal.querySelector('.vtq-name-input').value = group.name;
        portal.querySelector('.vtq-tags-input').value = group.tags
            .map(formatTagPreset)
            .join('\n');
        portal.querySelector('.vtq-save-group').textContent = '保存修改';
        portal.querySelector('.vtq-cancel-edit').hidden = false;
        portal.querySelector('.vtq-name-input').focus();
    }

    function resetEditor() {
        editingGroupId = null;
        portal.querySelector('.vtq-editor-title').textContent = '新增分类 / 情景';
        portal.querySelector('.vtq-name-input').value = '';
        portal.querySelector('.vtq-tags-input').value = '';
        portal.querySelector('.vtq-save-group').textContent = '新增';
        portal.querySelector('.vtq-cancel-edit').hidden = true;
    }

    function deleteGroup(id) {
        const group = groups.find((item) => item.id === id);
        if (!group || !window.confirm(`确定删除“${group.name}”吗？`)) return;
        groups = groups.filter((item) => item.id !== id);
        persistGroups();
        resetEditor();
        renderGroups();
        renderManager();
        renderGlobalSourceSelectors();
        showToast(`已删除“${group.name}”。`);
    }

    function resetGroups() {
        if (!window.confirm('确定恢复示例搜索标签，并清空全部标题、描述、发现标签与全局预设吗？')) return;
        groups = cloneDefaults();
        copyPresets = createEmptyCopyPresets();
        discoveryPresets = [];
        globalPresets = [];
        persistGroups();
        persistCopyPresets();
        persistDiscoveryPresets();
        persistGlobalPresets();
        resetEditor();
        resetCopyPresetEditors();
        resetDiscoveryPresetEditor();
        resetGlobalPresetEditor();
        renderGroups();
        renderAllManagers();
        renderCopyPresetBars();
        renderDiscoveryPresetBar();
        renderGlobalPresetBar();
        showToast('已恢复示例搜索标签，并清空其余全部预设。');
    }

    function installManagerDragging() {
        const container = portal.querySelector('.vtq-manage-items');
        let drag = null;

        container.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            const handle = event.target.closest('.vtq-drag-handle');
            const item = handle?.closest('.vtq-manage-item');
            if (!handle || !item) return;

            event.preventDefault();
            drag = {
                handle,
                item,
                pointerId: event.pointerId,
                initialOrder: groups.map((group) => group.id),
                moved: false,
            };
            item.classList.add('vtq-dragging');
            try {
                handle.setPointerCapture?.(event.pointerId);
            } catch {
                // 浏览器不支持指针捕获时仍可在列表内拖动。
            }
        });

        container.addEventListener('pointermove', (event) => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            event.preventDefault();

            const siblings = [...container.querySelectorAll('.vtq-manage-item')]
                .filter((item) => item !== drag.item);
            const insertBefore = siblings.find((item) => {
                const rect = item.getBoundingClientRect();
                return event.clientY < rect.top + rect.height / 2;
            });

            if (insertBefore) {
                if (drag.item.nextElementSibling !== insertBefore) {
                    container.insertBefore(drag.item, insertBefore);
                    drag.moved = true;
                }
            } else if (container.lastElementChild !== drag.item) {
                container.appendChild(drag.item);
                drag.moved = true;
            }
        });

        const finish = (event) => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            try {
                drag.handle.releasePointerCapture?.(event.pointerId);
            } catch {
                // 指针捕获已自动释放时无需处理。
            }

            drag.item.classList.remove('vtq-dragging');
            const nextOrder = [...container.querySelectorAll('.vtq-manage-item')]
                .map((item) => item.dataset.groupId);
            const orderChanged = drag.moved
                && nextOrder.some((id, index) => id !== drag.initialOrder[index]);

            drag = null;
            if (!orderChanged) return;

            const groupMap = new Map(groups.map((group) => [group.id, group]));
            groups = nextOrder.map((id) => groupMap.get(id)).filter(Boolean);
            persistGroups();
            renderGroups();
            renderManager();
        };

        container.addEventListener('pointerup', finish);
        container.addEventListener('pointercancel', finish);
    }

    function toggleTheme() {
        settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
        saveSettings();
        applyThemeMode();
    }

    function applyThemeMode() {
        const theme = settings.theme === 'dark' ? 'dark' : 'light';
        if (portal.dataset.theme !== theme) portal.dataset.theme = theme;
        if (inlineHost && inlineHost.dataset.theme !== theme) inlineHost.dataset.theme = theme;
        for (const host of Object.values(copyHosts)) {
            if (host && host.dataset.theme !== theme) host.dataset.theme = theme;
        }
        if (globalHost && globalHost.dataset.theme !== theme) globalHost.dataset.theme = theme;
        if (discoveryHost && discoveryHost.dataset.theme !== theme) discoveryHost.dataset.theme = theme;

        const button = portal.querySelector('.vtq-theme-toggle');
        if (button) {
            const isDark = theme === 'dark';
            const text = isDark ? '☀' : '☾';
            const title = isDark ? '切换为白色日间主题' : '切换为 VGen 蓝绿夜间主题';
            if (button.textContent !== text) button.textContent = text;
            if (button.title !== title) button.title = title;
            if (button.getAttribute('aria-label') !== title) {
                button.setAttribute('aria-label', title);
            }
        }
    }

    function exportGroups() {
        const data = JSON.stringify({
            type: 'vgen-quick-presets',
            version: 9,
            exportedAt: new Date().toISOString(),
            groups,
            copyPresets,
            discoveryPresets,
            globalPresets,
            settings: {
                modules: settings.modules,
                autoCollapseDiscovery: settings.autoCollapseDiscovery,
            },
        }, null, 2);
        const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `vgen-quick-presets-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('全局、标题、描述、发现标签和搜索标签预设已导出。');
    }

    async function importGroups(event) {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;

        try {
            const parsed = JSON.parse(await file.text());
            const imported = normalizeGroups(Array.isArray(parsed) ? parsed : parsed.groups);
            if (!imported.length) throw new Error('没有有效分类');
            const importedCopyPresets = parsed?.copyPresets
                ? normalizeCopyPresets(parsed.copyPresets)
                : null;
            const importedDiscoveryPresets = parsed?.discoveryPresets
                ? normalizeDiscoveryPresets(parsed.discoveryPresets)
                : null;
            const importedGlobalPresets = parsed?.globalPresets
                ? normalizeGlobalPresets(parsed.globalPresets)
                : null;
            if (!window.confirm(`将导入 ${imported.length} 个分类并覆盖当前预设，是否继续？`)) {
                return;
            }
            groups = imported;
            if (importedCopyPresets) copyPresets = importedCopyPresets;
            if (importedDiscoveryPresets) discoveryPresets = importedDiscoveryPresets;
            if (importedGlobalPresets) globalPresets = importedGlobalPresets;
            if (parsed?.settings?.modules && typeof parsed.settings.modules === 'object') {
                for (const kind of ['global', 'title', 'description', 'discovery', 'tags']) {
                    if (typeof parsed.settings.modules[kind] === 'boolean') {
                        settings.modules[kind] = parsed.settings.modules[kind];
                    }
                }
            }
            if (typeof parsed?.settings?.autoCollapseDiscovery === 'boolean') {
                settings.autoCollapseDiscovery = parsed.settings.autoCollapseDiscovery;
            }
            saveSettings();
            persistGroups();
            if (importedCopyPresets) persistCopyPresets();
            if (importedDiscoveryPresets) persistDiscoveryPresets();
            if (importedGlobalPresets) persistGlobalPresets();
            resetEditor();
            resetCopyPresetEditors();
            resetDiscoveryPresetEditor();
            resetGlobalPresetEditor();
            renderGroups();
            renderAllManagers();
            renderCopyPresetBars();
            renderDiscoveryPresetBar();
            renderGlobalPresetBar();
            refreshModuleSwitches();
            refreshEnabledModules();
            const legacy = !importedDiscoveryPresets && !importedGlobalPresets;
            showToast(legacy
                ? `已兼容导入 ${groups.length} 个旧版搜索标签分类及已有文案预设。`
                : `已导入 ${groups.length} 个搜索标签分类与新版全部预设。`,
            );
        } catch (error) {
            console.warn('[VGen 快速标签] 导入失败：', error);
            showToast('导入失败：文件格式不正确。');
        }
    }

    function loadGroups() {
        const stored = GM_getValue(DATA_KEY, null);
        if (stored === null || stored === undefined) {
            const defaults = cloneDefaults();
            GM_setValue(DATA_KEY, defaults);
            return defaults;
        }
        try {
            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            return normalizeGroups(parsed);
        } catch (error) {
            console.warn('[VGen 快速标签] 读取预设失败：', error);
            return cloneDefaults();
        }
    }

    function persistGroups() {
        GM_setValue(DATA_KEY, groups);
    }

    function loadCopyPresets() {
        const stored = GM_getValue(COPY_PRESETS_KEY, null);
        if (stored === null || stored === undefined) {
            const empty = createEmptyCopyPresets();
            GM_setValue(COPY_PRESETS_KEY, empty);
            return empty;
        }
        try {
            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            return normalizeCopyPresets(parsed);
        } catch (error) {
            console.warn('[VGen 快速标签] 读取标题与描述预设失败：', error);
            return createEmptyCopyPresets();
        }
    }

    function persistCopyPresets() {
        GM_setValue(COPY_PRESETS_KEY, copyPresets);
    }

    function createEmptyCopyPresets() {
        return {
            title: [],
            description: [],
        };
    }

    function normalizeCopyPresets(value) {
        const result = createEmptyCopyPresets();
        for (const kind of ['title', 'description']) {
            const source = Array.isArray(value?.[kind]) ? value[kind] : [];
            result[kind] = source.map((item) => {
                const rawValue = String(item?.value || '');
                const normalizedValue = kind === 'description'
                    ? normalizeRichTextJson(rawValue)
                    : rawValue.trim();
                if (kind === 'title' && !normalizedValue) return null;
                if (kind === 'description' && !descriptionToPlainText(normalizedValue).trim()) {
                    return null;
                }
                const name = kind === 'title'
                    ? normalizedValue.slice(0, 60)
                    : String(item?.name || '').trim().slice(0, 60);
                if (!name) return null;
                const preset = {
                    id: typeof item.id === 'string' && item.id ? item.id : makeId(),
                    name,
                    value: normalizedValue,
                };
                if (kind === 'title') {
                    preset.note = String(item?.note || '').trim().slice(0, 80);
                }
                return preset;
            }).filter(Boolean);
        }
        return result;
    }

    function normalizeRichTextJson(value) {
        try {
            const parsed = JSON.parse(String(value || DEFAULT_RICH_TEXT));
            if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_RICH_TEXT;
            return JSON.stringify(parsed);
        } catch {
            return plainTextToDescriptionJson(String(value || ''));
        }
    }

    function plainTextToDescriptionJson(text) {
        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
        const nodes = lines.map((line) => ({
            type: 'paragraph',
            children: [{ text: line }],
        }));
        return JSON.stringify(nodes.length ? nodes : JSON.parse(DEFAULT_RICH_TEXT));
    }

    function descriptionToPlainText(value) {
        try {
            const nodes = JSON.parse(normalizeRichTextJson(value));
            const readNode = (node) => {
                if (!node || typeof node !== 'object') return '';
                if (typeof node.text === 'string') return node.text;
                if (!Array.isArray(node.children)) return '';
                return node.children.map(readNode).join('');
            };
            return nodes.map(readNode).join('\n');
        } catch {
            return '';
        }
    }

    function loadDiscoveryPresets() {
        const stored = GM_getValue(DISCOVERY_PRESETS_KEY, []);
        try {
            return normalizeDiscoveryPresets(
                typeof stored === 'string' ? JSON.parse(stored) : stored,
            );
        } catch (error) {
            console.warn('[VGen 快速标签] 读取发现标签预设失败：', error);
            return [];
        }
    }

    function persistDiscoveryPresets() {
        GM_setValue(DISCOVERY_PRESETS_KEY, discoveryPresets);
    }

    function normalizeDiscoveryPresets(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => {
            const name = String(item?.name || '').trim().slice(0, 60);
            const schema = normalizeDiscoverySchema(item?.schema);
            const values = normalizeDiscoveryValues(item?.values);
            if (!name || !schema.length || !discoveryValuesComplete(schema, values)) return null;
            return {
                id: typeof item.id === 'string' && item.id ? item.id : makeId(),
                name,
                schema,
                values,
            };
        }).filter(Boolean);
    }

    function normalizeDiscoveryValues(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
        const result = {};
        for (const [key, selected] of Object.entries(value)) {
            const optionID = String(key || '').trim();
            if (!optionID) continue;
            if (Array.isArray(selected)) {
                result[optionID] = [...new Set(
                    selected.map((item) => String(item || '').trim()).filter(Boolean),
                )];
            } else if (selected !== null && selected !== undefined) {
                const normalized = String(selected).trim();
                if (normalized) result[optionID] = normalized;
            }
        }
        return result;
    }

    function discoveryValuesComplete(schema, values) {
        const normalized = normalizeDiscoveryValues(values);
        return normalizeDiscoverySchema(schema).every((option) => {
            const selected = normalized[option.optionID];
            return option.allowMultipleSelections
                ? Array.isArray(selected) && selected.length > 0
                : typeof selected === 'string' && Boolean(selected);
        });
    }

    function loadGlobalPresets() {
        const stored = GM_getValue(GLOBAL_PRESETS_KEY, []);
        try {
            return normalizeGlobalPresets(
                typeof stored === 'string' ? JSON.parse(stored) : stored,
            );
        } catch (error) {
            console.warn('[VGen 快速标签] 读取全局预设失败：', error);
            return [];
        }
    }

    function persistGlobalPresets() {
        GM_setValue(GLOBAL_PRESETS_KEY, globalPresets);
    }

    function normalizeGlobalPresets(value) {
        if (!Array.isArray(value)) return [];
        return value.map((item) => {
            const name = String(item?.name || '').trim().slice(0, 60);
            const title = String(item?.title || '').trim();
            const description = normalizeRichTextJson(item?.description);
            const discoverySchema = normalizeDiscoverySchema(item?.discoverySchema);
            const discoveryValues = normalizeDiscoveryValues(item?.discoveryValues);
            const tags = normalizeTags(item?.tags)
                .map((preset) => normalizeNativeTag(preset.tag))
                .filter(isValidNativeTag)
                .slice(0, SHOWCASE_TAG_LIMIT);
            if (
                !name || !title
                || !discoverySchema.length
                || !discoveryValuesComplete(discoverySchema, discoveryValues)
            ) return null;
            return {
                id: typeof item.id === 'string' && item.id ? item.id : makeId(),
                name, title, description, discoverySchema, discoveryValues, tags,
            };
        }).filter(Boolean);
    }

    function loadSettings() {
        const stored = GM_getValue(SETTINGS_KEY, null);
        const parsed = stored && typeof stored === 'object' ? stored : {};
        return {
            collapsed: Boolean(parsed.collapsed),
            groupExpanded: parsed.groupExpanded && typeof parsed.groupExpanded === 'object'
                ? { ...parsed.groupExpanded }
                : {},
            modules: {
                global: parsed.modules?.global !== false,
                title: parsed.modules?.title !== false,
                description: parsed.modules?.description !== false,
                discovery: parsed.modules?.discovery !== false,
                tags: parsed.modules?.tags !== false,
            },
            autoCollapseDiscovery: parsed.autoCollapseDiscovery !== false,
            theme: parsed.theme === 'dark' ? 'dark' : 'light',
        };
    }

    function saveSettings() {
        GM_setValue(SETTINGS_KEY, settings);
    }

    function normalizeGroups(value) {
        if (!Array.isArray(value)) return [];
        return value.map((group) => {
            const name = String(group?.name || '').trim();
            const tags = normalizeTags(group?.tags);
            if (!name || !tags.length) return null;
            return {
                id: typeof group.id === 'string' && group.id ? group.id : makeId(),
                name: name.slice(0, 50),
                tags,
            };
        }).filter(Boolean);
    }

    function normalizeTags(value) {
        const source = Array.isArray(value)
            ? value
            : splitTagPresetEntries(String(value || ''));
        const seen = new Set();
        const result = [];
        source.forEach((raw) => {
            const preset = normalizeTagPreset(raw);
            const key = tagKey(preset.tag);
            if (!preset.tag || seen.has(key)) return;
            seen.add(key);
            result.push(preset);
        });
        return result;
    }

    function parseTags(text) {
        return normalizeTags(splitTagPresetEntries(String(text || '')));
    }

    function splitTagPresetEntries(text) {
        const entries = [];
        let current = '';
        let noteDepth = 0;

        for (const character of String(text || '')) {
            if (character === '【') noteDepth += 1;
            if (character === '】' && noteDepth > 0) noteDepth -= 1;

            if (/[\n\r,，、]/.test(character) && noteDepth === 0) {
                if (current.trim()) entries.push(current.trim());
                current = '';
            } else {
                current += character;
            }
        }

        if (current.trim()) entries.push(current.trim());
        return entries;
    }

    function normalizeTagPreset(value) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return {
                tag: normalizeNativeTag(value.tag ?? value.value ?? ''),
                note: String(value.note || '').trim().slice(0, 120),
            };
        }

        const text = String(value || '').trim();
        const match = text.match(/^(.*?)\s*【([\s\S]*)】\s*$/);
        return {
            tag: normalizeNativeTag(match ? match[1] : text),
            note: match ? match[2].trim().slice(0, 120) : '',
        };
    }

    function formatTagPreset(preset) {
        const normalized = normalizeTagPreset(preset);
        return normalized.note
            ? `${normalized.tag}【${normalized.note}】`
            : normalized.tag;
    }

    function cloneDefaults() {
        return DEFAULT_GROUPS.map((group) => ({
            id: makeId(),
            name: group.name,
            tags: normalizeTags(group.tags),
        }));
    }

    function tagKey(tag) {
        return String(tag || '').trim().toLocaleLowerCase();
    }

    function makeId() {
        if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
        return `vtq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function isRendered(element) {
        if (!(element instanceof Element)) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && style.opacity !== '0'
            && element.getClientRects().length > 0;
    }

    function isInViewport(element) {
        if (!isRendered(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0
            && rect.right > 0
            && rect.top < window.innerHeight
            && rect.left < window.innerWidth;
    }

    function isDisabled(element) {
        return Boolean(
            element.disabled
            || element.getAttribute('aria-disabled') === 'true'
            || element.getAttribute('contenteditable') === 'false',
        );
    }

    function createButton(text, className) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        return excludeFromTranslation(button);
    }

    function showToast(message, duration = 3000) {
        const toast = portal.querySelector('.vtq-toast');
        toast.textContent = message;
        excludeFromTranslation(toast);
        toast.dataset.show = 'true';
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => {
            toast.dataset.show = 'false';
        }, duration);
    }

    function sleep(milliseconds) {
        return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    }
})();
