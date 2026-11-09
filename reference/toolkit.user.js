// ==UserScript==
// @name         VGen小工具
// @namespace    https://vgen.co/
// @version      0.6.0
// @description  VGen 聊天已读控制、消息状态与时间显示、紧凑表态和常用访问。
// @author       @Nekori_Net
// @license      MIT
// @match        https://vgen.co/*
// @icon         https://vgen.co/img/favicon-32x32.png
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        unsafeWindow
// ==/UserScript==

(() => {
    'use strict';

    const VERSION = '0.6.0';
    const PREFIX = '[VGen小工具]';
    const CLIENTS_KEY = 'vgen-toolkit-frequent-clients-v1';
    const SETTINGS_KEY = 'vgen-toolkit-settings-v2';
    const PANEL_ID = 'vgt-frequent-clients';
    const MODAL_ID = 'vgt-client-manager';
    const TOAST_ID = 'vgt-toast';
    const API_BASE = 'https://api.vgen.co';
    const API_HEADERS = Object.freeze({ 'v-client-id': 'vgen-web' });
    const PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;
    const CHAT_META_CLASS = 'vgt-chat-meta-on';
    const CHAT_REACTION_CLASS = 'vgt-compact-reactions-on';
    const RESERVED_PATHS = new Set([
        '', '403', '404', 'about', 'artists', 'authorize', 'cart', 'catalogue',
        'category', 'challenge', 'commission', 'creator', 'export', 'for-artists',
        'genies-gallery', 'invites', 'login', 'messages', 'monitoring', 'my-orders',
        'my-requests', 'portfolio', 'privacy-policy', 'redirect', 'reset-password',
        'saved', 'search', 'settings', 'shop', 'sign-on-gateway', 'signup',
        'sitemaps', 'terms-of-service', 'timelapse', 'verified', 'vsona'
    ]);

    let clients = loadClients();
    let settings = loadSettings();
    let observer = null;
    let scanFrame = 0;
    let toastTimer = 0;
    let refreshRunning = false;
    const invokedLatestButtons = new WeakSet();
    const latestButtonAttempts = new WeakMap();
    const latestButtonNextAttemptAt = new WeakMap();
    const pendingScanRoots = new Set();
    const latestBridgeEvent = 'vgt:request-latest-v031';
    const latestBridgeResultEvent = 'vgt:latest-result-v031';
    const siteDiagCommandEvent = 'vgt:site-diagnostic-command-v060';
    const siteDiagResultEvent = 'vgt:site-diagnostic-result-v060';
    const siteDiagPending = new Map();
    let siteDiagUIFrame = 0;
    let siteDiagUISignature = '';
    let siteDiagLastUIState = null;
    let readControlEnabled = settings.keepUnread;
    const CHAT_SETTINGS_ID = 'vgt-chat-settings';
    const MONITOR_BAR_ID = 'vgt-monitor-bar';
    const DEV_DIALOG_ID = 'vgt-developer-options';
    let monitorBarTimer = 0;
    let monitorStopping = false;
    const chatRuntime = {
        bridgeInstalled: false,
        bridgeLastResult: 'not-requested',
        latestRequests: 0,
        latestSuccesses: 0
    };
    const siteDiagnosticRuntime = {
        bridgeInstalled: false,
        active: false,
        startedAt: null,
        eventCount: 0,
        droppedCount: 0,
        lastStatus: 'not-started'
    };

    installSiteDiagnosticBridge();
    if (document.documentElement) {
        document.documentElement.classList.add(CHAT_META_CLASS, CHAT_REACTION_CLASS);
    } else {
        document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.classList.add(CHAT_META_CLASS, CHAT_REACTION_CLASS);
        }, { once: true });
    }

    GM_addStyle(`
        /* ── 聊天：时间戳与已读状态常驻 ───────────────────────── */
        html.${CHAT_META_CLASS} .str-chat__message-metadata,
        html.${CHAT_META_CLASS} .str-chat__message-metadata[data-visible="false"],
        html.${CHAT_META_CLASS} .str-chat__message-metadata[data-visible="true"],
        html.${CHAT_META_CLASS} .str-chat__li--top .str-chat__message-metadata,
        html.${CHAT_META_CLASS} .str-chat__li--middle .str-chat__message-metadata,
        html.${CHAT_META_CLASS} [data-vgt-message-metadata="true"] {
            display: flex !important;
            opacity: 1 !important;
            visibility: visible !important;
            pointer-events: auto !important;
            height: auto !important;
            min-height: 20px !important;
            max-height: none !important;
            overflow: visible !important;
        }

        html.${CHAT_META_CLASS} .str-chat__message-metadata__timestamp,
        html.${CHAT_META_CLASS} .str-chat__message-simple-timestamp,
        html.${CHAT_META_CLASS} .str-chat__message-status,
        html.${CHAT_META_CLASS} [data-vgt-message-metadata="true"] time {
            display: inline-flex !important;
            opacity: 1 !important;
            visibility: visible !important;
        }

        /* Native VGen reaction buttons stay in React's tree; flex order changes presentation only. */
        html.${CHAT_REACTION_CLASS} .str-chat__message-bubble-group {
            display: flex !important; flex-direction: column !important; overflow: visible !important;
        }
        html.${CHAT_REACTION_CLASS} .str-chat__message-bubble-group > .str-chat__message-bubble { order: 10 !important; }
        html.${CHAT_REACTION_CLASS} .str-chat__message-bubble-group > .str-chat__message-reactions-host,
        html.${CHAT_REACTION_CLASS} .str-chat__message-bubble-group > .vgt-reactions-host {
            order: 20 !important; position: static !important; transform: none !important;
            display: flex !important; width: 100% !important; min-width: 0 !important;
            margin: 0 !important; padding: 6px 0 0 !important; justify-content: flex-start !important;
            overflow: visible !important;
        }
        html.${CHAT_REACTION_CLASS} .str-chat__message-bubble-group[data-message-side="outgoing"] > .str-chat__message-reactions-host {
            justify-content: flex-end !important;
        }
        html.${CHAT_REACTION_CLASS} [data-vgt-reactions="true"] {
            position: static !important; inset: auto !important; transform: none !important;
            display: flex !important; flex-wrap: wrap !important; align-items: center !important;
            justify-content: flex-start !important; gap: 3px !important; width: fit-content !important;
            min-width: 0 !important; max-width: 100% !important; height: auto !important;
            min-height: 0 !important; margin: 0 !important; padding: 0 !important;
            box-shadow: none !important; background: transparent !important; border: 0 !important;
        }
        html.${CHAT_REACTION_CLASS} [data-vgt-reaction-list="true"] {
            display: flex !important; flex-wrap: wrap !important; align-items: center !important;
            gap: 3px !important; margin: 0 !important; padding: 0 !important;
            box-shadow: none !important; border: 0 !important; background: transparent !important;
        }
        html.${CHAT_REACTION_CLASS} [data-vgt-reaction-item="true"] {
            display: inline-flex !important; align-items: center !important; min-width: 0 !important;
            width: fit-content !important; min-height: 0 !important; height: 18px !important;
            padding: 1px 3px !important; box-sizing: border-box !important; margin: 0 !important;
            border-radius: 5px !important; box-shadow: 0 0 0 1px #8884 !important;
            line-height: 14px !important;
        }
        html.${CHAT_REACTION_CLASS} [data-vgt-reaction-list="true"] :is(button[data-reaction-type], button[data-testid^="reactions-list-button-"]) {
            --str-chat__stream-emoji-size: 12px !important;
            display: inline-flex !important; align-items: center !important; justify-content: center !important;
            width: auto !important; min-width: 12px !important; height: 14px !important; min-height: 0 !important;
            margin: 0 !important; padding: 0 !important; font-size: 12px !important; line-height: 14px !important;
        }
        html.${CHAT_REACTION_CLASS} [data-vgt-reaction-item="true"] :is(svg, img) {
            width: 12px !important; height: 12px !important; max-width: 12px !important; max-height: 12px !important;
        }
        html.${CHAT_REACTION_CLASS} [data-vgt-reaction-item="true"] :is(span, p) {
            font-size: 12px !important; line-height: 14px !important; margin: 0 !important;
        }
        html.${CHAT_REACTION_CLASS} .str-chat__message-bubble-group > .vgt-state-meta { order: 30 !important; }

        /* Status icons anchor to the bubble edge, independently of text/translation height. */
        html.${CHAT_META_CLASS} .str-chat__message-bubble.vgt-read-bubble {
            position: relative !important;
        }

        html.${CHAT_META_CLASS} .vgt-read-marker {
            position: absolute !important;
            top: 2px !important;
            right: 2px !important;
            z-index: 30 !important;
            display: block !important;
            width: 12px !important;
            height: 9px !important;
            margin: 0 !important;
            padding: 0 !important;
            color: #3bdfbc !important;
            filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.42));
            pointer-events: none !important;
        }

        html.${CHAT_META_CLASS} .vgt-read-marker svg {
            display: block !important;
            width: 12px !important;
            height: 9px !important;
            overflow: visible !important;
        }

        html.${CHAT_META_CLASS} [data-vgt-state-managed="true"] [class*="ChatMessageStatus__StatusText"] {
            display: none !important;
        }

        #${MONITOR_BAR_ID} {
            position: fixed; top: 0; left: 0; right: 0; z-index: 2147483600;
            min-height: 44px; box-sizing: border-box; display: flex; align-items: center;
            justify-content: center; flex-wrap: wrap; gap: 8px 20px; padding: 6px 14px;
            background: #102e33; color: #ecffff; border-bottom: 2px solid #50dbbb;
            box-shadow: 0 2px 8px #0005; font: 13px/1.4 system-ui, sans-serif;
        }
        #${MONITOR_BAR_ID} button, .vgt-settings-dialog button {
            cursor: pointer; border: 1px solid #54cbb4; border-radius: 7px;
            padding: 5px 12px; color: #ecffff; background: #225052; font: inherit;
        }
        #${MONITOR_BAR_ID} button:disabled { opacity: .6; cursor: wait; }
        #${MONITOR_BAR_ID} [data-role="experiments"] { color: #ffd083; }
        html.vgt-monitor-active { scroll-padding-top: 54px; }
        #vgt-monitor-spacer { height: 48px; flex-shrink: 0; }
        .vgt-settings-dialog {
            width: min(390px, 90vw); color: #e5f7f3; background: #192b32;
            border: 1px solid #537879; border-radius: 12px; padding: 22px;
            font: 14px/1.7 system-ui, sans-serif; z-index: 2147483601;
        }
        .vgt-settings-dialog::backdrop { background: #0007; }
        .vgt-settings-dialog label { display: flex; align-items: center; gap: 8px; margin: 12px 0; }
        .vgt-settings-dialog input { accent-color: #3bdfbc; }
        .vgt-settings-dialog .vgt-dev-actions { display: flex; gap: 10px; margin-top: 18px; }
        html.${CHAT_META_CLASS} [data-vgt-state-managed="true"] .str-chat__message-metadata,
        html.${CHAT_META_CLASS} [data-vgt-state-managed="true"] .str-chat__message-simple-timestamp,
        html.${CHAT_META_CLASS} [data-vgt-state-managed="true"] .str-chat__message-status { display: none !important; }
        .vgt-state-meta {
            order: 30 !important; width: 100%; box-sizing: border-box; padding-top: 3px;
            display: flex !important; align-items: center; justify-content: space-between;
            gap: 20px; min-height: 18px; margin-top: 3px; font: 11px/18px system-ui, sans-serif;
            color: inherit; opacity: .72; user-select: text; pointer-events: auto;
        }
        .vgt-state-time { margin-left: auto; white-space: nowrap; }
        .vgt-state-marker {
            position: absolute !important; top: -8px; right: -8px; z-index: 30;
            display: flex !important; align-items: center; justify-content: center;
            width: 20px; height: 20px; border: 0; border-radius: 50%; padding: 0; margin: 0;
            background: transparent; color: #3bdfbc; font: bold 16px/20px system-ui;
            filter: drop-shadow(0 1px 1px #0007); opacity: 1 !important;
        }
        .vgt-state-marker[data-status="unread"] { color: #ff6476; cursor: pointer; pointer-events: auto; }
        .vgt-state-marker[data-status="unread"]:hover { background: #ff647630; box-shadow: 0 0 0 2px #ff647655; }
        .vgt-state-marker[data-status="unread"]:focus-visible { outline: 2px solid #ff9da8; }
        .vgt-state-marker[data-status="read"] { cursor: default; pointer-events: auto; }


        .vgt-settings-dialog p { font-size: 12px; color: #b9cbd0; margin: 4px 0 14px; }
        html.${CHAT_META_CLASS} .str-chat__message-bubble.vgt-read-bubble,
        html.${CHAT_META_CLASS} .str-chat__message-bubble-group { overflow: visible !important; }
        .vgt-state-marker[data-direction="incoming"] { top: auto; bottom: -8px; right: -8px; }
        .vgt-state-marker[data-direction="outgoing"] { top: -8px; bottom: auto; right: -8px; }
        .vgt-state-marker[data-status="pending"] { color: #c8737f; cursor: wait; pointer-events: auto; }
        .vgt-state-marker[data-status="unread"]:hover { transform: scale(1.08); }
        #${PANEL_ID} .vgt-avatar-chat {
            position: relative; flex: 0 0 29px; width: 29px; height: 29px; align-self: center;
            border: 0; padding: 0; margin: 0 11px 0 12px; border-radius: 8px;
            background: transparent; cursor: pointer; z-index: 2; overflow: visible;
        }
        #${PANEL_ID} .vgt-avatar-chat:hover { box-shadow: 0 0 0 2px #3bdfbc; }
        #${PANEL_ID} .vgt-avatar-chat:focus-visible { outline: 2px solid #3bdfbc; outline-offset: 3px; }
        #${PANEL_ID} .vgt-avatar-chat:disabled { opacity: .65; cursor: wait; }
        #${PANEL_ID} .vgt-avatar-chat-badge {
            position: absolute; right: -5px; bottom: -5px; z-index: 3;
            display: flex; align-items: center; justify-content: center; width: 16px; height: 16px;
            background: var(--vgt-bg, #fff); color: var(--vgt-text, #253239);
            border-radius: 50%; box-shadow: 0 0 0 1px #a1b5b8; pointer-events: none;
        }
        #${PANEL_ID} .vgt-avatar-chat-badge svg { width: 14px; height: 14px; fill: currentColor; }
        #${PANEL_ID} .vgt-row { display: flex; align-items: center; }
        #${PANEL_ID} .vgt-row .vgt-client-link { flex: 1 1 0; min-width: 0; padding-left: 0; }
        #${PANEL_ID} .vgt-client-announcement[hidden] { display: none !important; }
        /* ── 仪表盘：常用访问 ───────────────────────────────── */
        #${PANEL_ID},
        #${PANEL_ID} * {
            box-sizing: border-box;
        }

        #${PANEL_ID} {
            --vgt-bg: transparent;
            --vgt-shell: rgba(255, 255, 255, 0.62);
            --vgt-soft: rgba(34, 45, 66, 0.07);
            --vgt-hover: rgba(79, 124, 255, 0.11);
            --vgt-text: #252a37;
            --vgt-muted: #737b8e;
            --vgt-border: rgba(32, 45, 69, 0.15);
            --vgt-blue: #4f7cff;
            --vgt-green: #20cda7;
            --vgt-blue-soft: rgba(79, 124, 255, 0.13);
            --vgt-danger: #d84f67;
            --vgt-min-height: 220px;
            --vgt-row-height: 52px;
            display: flex;
            flex: 1 1 var(--vgt-min-height);
            flex-direction: column;
            justify-content: flex-end;
            width: auto;
            min-height: var(--vgt-min-height);
            margin: 4px 8px 8px 6px;
            color: var(--vgt-text);
            background: transparent;
            font-family: inherit;
            line-height: 1.35;
            overflow: hidden;
            transition: flex-basis 160ms ease, min-height 160ms ease;
        }

        #${PANEL_ID}[data-theme="dark"] {
            --vgt-bg: #252634;
            --vgt-shell: rgba(41, 42, 55, 0.96);
            --vgt-soft: rgba(255, 255, 255, 0.055);
            --vgt-hover: rgba(113, 149, 255, 0.14);
            --vgt-text: #f2f4f8;
            --vgt-muted: #b7bdca;
            --vgt-border: rgba(255, 255, 255, 0.10);
            --vgt-blue: #7195ff;
            --vgt-green: #3bdfbc;
            --vgt-blue-soft: rgba(113, 149, 255, 0.17);
            --vgt-danger: #ff7286;
        }

        .vgt-has-panel > .sidebarLinks {
            flex-grow: 0 !important;
            min-height: 0 !important;
        }

        #${PANEL_ID}[data-collapsed="true"] {
            flex: 1 1 22px;
            min-height: 22px;
        }

        #${PANEL_ID} .vgt-shell {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            width: 100%;
            min-height: 0;
            border-top: 1px solid var(--vgt-border);
            border-bottom: 1px solid var(--vgt-border);
            color: var(--vgt-text);
            background: var(--vgt-shell);
            overflow: hidden;
            transition: height 160ms ease;
        }

        #${PANEL_ID}[data-collapsed="true"] .vgt-shell {
            flex: 0 0 22px;
            height: 22px;
        }

        #${PANEL_ID} .vgt-accent {
            height: 1px;
            flex: 0 0 auto;
            background: linear-gradient(90deg, var(--vgt-blue), var(--vgt-green));
        }

        #${PANEL_ID} .vgt-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 20px;
            height: 20px;
            flex: 0 0 20px;
            padding: 1px 3px 1px 8px;
            border-bottom: 1px solid var(--vgt-border);
            background: var(--vgt-soft);
        }

        #${PANEL_ID} .vgt-title {
            display: flex;
            align-items: center;
            gap: 5px;
            min-width: 0;
            margin: 0;
            color: var(--vgt-text);
            font-size: 10px;
            font-weight: 750;
        }

        #${PANEL_ID} .vgt-title-dot {
            width: 5px;
            height: 5px;
            flex: 0 0 auto;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--vgt-blue), var(--vgt-green));
            box-shadow: 0 0 0 2px var(--vgt-blue-soft);
        }

        #${PANEL_ID} button,
        #${PANEL_ID} input {
            font: inherit;
        }

        #${PANEL_ID} button {
            border: 0;
            color: inherit;
            cursor: pointer;
        }

        #${PANEL_ID} .vgt-header-actions {
            display: flex;
            align-items: center;
            gap: 1px;
        }

        #${PANEL_ID} .vgt-icon-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            flex: 0 0 auto;
            border-radius: 5px;
            color: var(--vgt-muted);
            background: transparent;
            padding: 0;
            font-size: 0;
            line-height: 0;
        }

        #${PANEL_ID} .vgt-icon-button svg {
            display: block;
            width: 11px;
            height: 11px;
            flex: 0 0 auto;
            stroke: currentColor;
        }

        #${PANEL_ID} .vgt-collapse svg {
            transition: transform 150ms ease;
        }

        #${PANEL_ID}[data-collapsed="true"] .vgt-collapse svg {
            transform: rotate(180deg);
        }

        #${PANEL_ID} .vgt-icon-button:hover {
            color: var(--vgt-text);
            background: var(--vgt-hover);
        }

        #${PANEL_ID} .vgt-list {
            min-height: 0;
            flex: 1 1 auto;
            margin: 0;
            padding: 4px 3px 5px;
            list-style: none;
            overflow-x: hidden;
            overflow-y: auto;
            scrollbar-width: thin;
        }

        #${PANEL_ID}[data-collapsed="true"] .vgt-list,
        #${PANEL_ID}[data-collapsed="true"] .vgt-accent {
            display: none;
        }

        #${PANEL_ID} .vgt-empty {
            padding: 18px 8px;
            color: var(--vgt-muted);
            text-align: center;
            font-size: 11px;
        }

        #${PANEL_ID} .vgt-row {
            display: flex;
            align-items: center;
            position: relative;
            min-height: var(--vgt-row-height);
            height: var(--vgt-row-height);
            min-width: 0;
            margin-bottom: 3px;
            border: 1px solid var(--vgt-border);
            border-radius: 8px;
            background-color: var(--vgt-soft);
            background-position: center 42%;
            background-size: cover;
            overflow: hidden;
        }

        #${PANEL_ID} .vgt-row::before {
            content: "";
            position: absolute;
            inset: 0;
            background: linear-gradient(90deg, color-mix(in srgb, var(--vgt-bg) 94%, transparent) 0%, color-mix(in srgb, var(--vgt-bg) 84%, transparent) 62%, color-mix(in srgb, var(--vgt-bg) 54%, transparent) 100%);
            pointer-events: none;
        }

        #${PANEL_ID} .vgt-row:hover::before {
            background: linear-gradient(90deg, color-mix(in srgb, var(--vgt-hover) 86%, var(--vgt-bg)) 0%, color-mix(in srgb, var(--vgt-hover) 66%, transparent) 100%);
        }

        #${PANEL_ID} .vgt-client-link {
            display: flex;
            align-items: center;
            position: relative;
            z-index: 1;
            gap: 7px;
            min-width: 0;
            flex: 1 1 auto;
            height: 100%;
            min-height: 0;
            padding: 5px 6px;
            border-radius: 8px;
            color: var(--vgt-text);
            text-decoration: none;
        }

        #${PANEL_ID} .vgt-avatar {
            display: block;
            width: 29px;
            height: 29px;
            flex: 0 0 auto;
            border: 1px solid color-mix(in srgb, var(--vgt-green) 45%, var(--vgt-border));
            border-radius: 8px;
            background: var(--vgt-soft);
            object-fit: cover;
        }

        #${PANEL_ID} .vgt-client-text {
            display: flex;
            flex-direction: column;
            min-width: 0;
            flex: 1 1 auto;
        }

        #${PANEL_ID} .vgt-client-name {
            min-width: 0;
            overflow: hidden;
            color: var(--vgt-text);
            font-size: 10.5px;
            font-weight: 700;
            line-height: 1.25;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${PANEL_ID} .vgt-client-identity {
            display: flex;
            align-items: baseline;
            gap: 4px;
            min-width: 0;
            overflow: hidden;
        }

        #${PANEL_ID} .vgt-client-hint {
            min-width: 0;
            flex: 0 1 auto;
            color: var(--vgt-muted);
            overflow: hidden;
            font-size: 8.5px;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${PANEL_ID} .vgt-client-announcement {
            margin-top: 2px;
            overflow: hidden;
            color: color-mix(in srgb, var(--vgt-text) 72%, var(--vgt-muted));
            font-size: 8.2px;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${PANEL_ID} .vgt-client-updates {
            margin-top: 2px;
            overflow: hidden;
            color: var(--vgt-muted);
            font-size: 7.8px;
            line-height: 1.2;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* ── 常用访问：管理窗口 ─────────────────────────────── */
        #${MODAL_ID},
        #${MODAL_ID} * {
            box-sizing: border-box;
        }

        #${MODAL_ID} {
            --vgt-bg: #fff;
            --vgt-soft: #f3f5f9;
            --vgt-text: #252a37;
            --vgt-muted: #737b8e;
            --vgt-border: rgba(32, 45, 69, 0.16);
            --vgt-blue: #4f7cff;
            --vgt-green: #20cda7;
            --vgt-danger: #d84f67;
            position: fixed;
            inset: 0;
            z-index: 2147483645;
            display: grid;
            place-items: center;
            padding: 18px;
            color: var(--vgt-text);
            background: rgba(8, 10, 16, 0.62);
            backdrop-filter: blur(3px);
            font: 12px/1.4 system-ui, sans-serif;
        }

        #${MODAL_ID}[data-theme="dark"] {
            --vgt-bg: #272834;
            --vgt-soft: #323440;
            --vgt-text: #f2f4f8;
            --vgt-muted: #aeb5c4;
            --vgt-border: rgba(255, 255, 255, 0.11);
            --vgt-blue: #7195ff;
            --vgt-green: #3bdfbc;
            --vgt-danger: #ff7286;
        }

        #${MODAL_ID}[hidden] { display: none !important; }

        #${MODAL_ID} .vgt-dialog {
            width: min(560px, calc(100vw - 28px));
            max-height: min(720px, calc(100vh - 36px));
            display: flex;
            flex-direction: column;
            border: 1px solid var(--vgt-border);
            border-radius: 14px;
            background: var(--vgt-bg);
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
            overflow: hidden;
        }

        #${MODAL_ID} .vgt-dialog-header,
        #${MODAL_ID} .vgt-dialog-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 10px 12px;
            border-bottom: 1px solid var(--vgt-border);
            background: var(--vgt-soft);
        }

        #${MODAL_ID} .vgt-dialog-footer {
            border-top: 1px solid var(--vgt-border);
            border-bottom: 0;
        }

        #${MODAL_ID} h2 { margin: 0; font-size: 14px; }
        #${MODAL_ID} button,
        #${MODAL_ID} input { font: inherit; }
        #${MODAL_ID} button { cursor: pointer; }

        #${MODAL_ID} .vgt-close,
        #${MODAL_ID} .vgt-delete,
        #${MODAL_ID} .vgt-row-refresh {
            border: 0;
            border-radius: 7px;
            color: var(--vgt-muted);
            background: transparent;
        }

        #${MODAL_ID} .vgt-close { width: 28px; height: 28px; font-size: 18px; }
        #${MODAL_ID} .vgt-close:hover { background: var(--vgt-soft); color: var(--vgt-text); }

        #${MODAL_ID} .vgt-dialog-body {
            min-height: 0;
            padding: 12px;
            overflow-y: auto;
        }

        #${MODAL_ID} .vgt-add-form {
            display: grid;
            grid-template-columns: minmax(0, 1fr) minmax(110px, .42fr) auto;
            gap: 7px;
            margin-bottom: 12px;
        }

        #${MODAL_ID} input {
            width: 100%;
            height: 32px;
            min-width: 0;
            padding: 0 9px;
            border: 1px solid var(--vgt-border);
            border-radius: 8px;
            outline: none;
            color: var(--vgt-text);
            background: var(--vgt-bg);
        }

        #${MODAL_ID} input:focus {
            border-color: var(--vgt-blue);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--vgt-blue) 20%, transparent);
        }

        #${MODAL_ID} .vgt-primary,
        #${MODAL_ID} .vgt-secondary {
            min-height: 32px;
            padding: 0 12px;
            border: 1px solid var(--vgt-border);
            border-radius: 8px;
            color: var(--vgt-text);
            background: var(--vgt-soft);
            font-weight: 700;
        }

        #${MODAL_ID} .vgt-primary {
            border: 0;
            color: #fff;
            background: linear-gradient(135deg, var(--vgt-blue), var(--vgt-green));
        }

        #${MODAL_ID} .vgt-manage-list { display: grid; gap: 6px; }

        #${MODAL_ID} .vgt-manage-row {
            display: grid;
            grid-template-columns: 22px 34px minmax(0, 1fr) 30px 30px;
            align-items: center;
            gap: 7px;
            padding: 6px;
            border: 1px solid var(--vgt-border);
            border-radius: 9px;
            background: var(--vgt-soft);
        }

        #${MODAL_ID} .vgt-manage-row.is-dragging { opacity: .45; }
        #${MODAL_ID} .vgt-drag {
            border: 0;
            color: var(--vgt-muted);
            background: transparent;
            cursor: grab;
            font-size: 15px;
            touch-action: none;
        }
        #${MODAL_ID} .vgt-drag:active { cursor: grabbing; }

        #${MODAL_ID} .vgt-manage-avatar {
            width: 34px;
            height: 34px;
            border: 1px solid var(--vgt-border);
            border-radius: 8px;
            object-fit: cover;
            background: var(--vgt-bg);
        }

        #${MODAL_ID} .vgt-note-wrap { min-width: 0; }
        #${MODAL_ID} .vgt-note-input { height: 29px; font-size: 11px; }
        #${MODAL_ID} .vgt-original-id {
            margin: 2px 2px 0;
            overflow: hidden;
            color: var(--vgt-muted);
            font-size: 9px;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        #${MODAL_ID} .vgt-delete { width: 28px; height: 28px; font-size: 17px; }
        #${MODAL_ID} .vgt-delete:hover { color: var(--vgt-danger); background: color-mix(in srgb, var(--vgt-danger) 10%, transparent); }
        #${MODAL_ID} .vgt-row-refresh { width: 28px; height: 28px; font-size: 14px; }
        #${MODAL_ID} .vgt-row-refresh:hover { color: var(--vgt-green); background: color-mix(in srgb, var(--vgt-green) 10%, transparent); }

        #${MODAL_ID} .vgt-settings {
            display: grid;
            gap: 8px;
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--vgt-border);
        }

        #${MODAL_ID} .vgt-setting {
            display: grid;
            grid-template-columns: auto minmax(130px, 1fr) 48px;
            align-items: center;
            gap: 10px;
            color: var(--vgt-muted);
        }

        #${MODAL_ID} .vgt-height-range,
        #${MODAL_ID} .vgt-row-height-range { height: auto; padding: 0; accent-color: var(--vgt-green); }
        #${MODAL_ID} .vgt-height-value,
        #${MODAL_ID} .vgt-row-height-value { text-align: right; }
        #${MODAL_ID} .vgt-empty-manage { padding: 16px; color: var(--vgt-muted); text-align: center; }

        @media (max-width: 600px) {
            #${MODAL_ID} .vgt-add-form { grid-template-columns: 1fr; }
        }

        #${TOAST_ID} {
            position: fixed;
            right: 22px;
            bottom: 22px;
            z-index: 2147483646;
            max-width: min(360px, calc(100vw - 32px));
            padding: 10px 13px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 10px;
            color: #f6f8fb;
            background: #30313f;
            box-shadow: 0 12px 34px rgba(0, 0, 0, 0.32);
            font: 12px/1.45 system-ui, sans-serif;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 160ms ease, transform 160ms ease;
            pointer-events: none;
        }

        #${TOAST_ID}.is-visible {
            opacity: 1;
            transform: translateY(0);
        }

        @media (max-width: 1023px) {
            #${PANEL_ID} {
                display: none !important;
            }
        }

        [class*="DesktopSidebar__Sidebar"][data-collapsed="true"] #${PANEL_ID} {
            display: none !important;
        }

        #${PANEL_ID} [class*="immersive-translate"],
        #${PANEL_ID} .immersive-translate-target-wrapper {
            display: none !important;
        }
    `);

    function loadClients() {
        const raw = GM_getValue(CLIENTS_KEY, []);
        if (!Array.isArray(raw)) return [];
        const seen = new Set();
        return raw.flatMap((item) => {
            if (!item || typeof item.username !== 'string') return [];
            const username = item.username.trim().replace(/^@/, '');
            const key = username.toLocaleLowerCase();
            if (!username || seen.has(key)) return [];
            seen.add(key);
            return [{
                id: typeof item.id === 'string' ? item.id : makeID(),
                username,
                url: `https://vgen.co/${encodeURIComponent(username)}`,
                note: typeof item.note === 'string' ? item.note.slice(0, 80) : '',
                userID: typeof item.userID === 'string' ? item.userID : '',
                displayName: typeof item.displayName === 'string' ? item.displayName : '',
                avatarURL: safeRemoteURL(item.avatarURL),
                bannerURL: safeRemoteURL(item.bannerURL),
                announcementMessage: typeof item.announcementMessage === 'string' ? item.announcementMessage.slice(0, 500) : '',
                announcementModified: normaliseDateString(item.announcementModified),
                lastServiceUpdate: normaliseDateString(item.lastServiceUpdate),
                lastPortfolioUpdate: normaliseDateString(item.lastPortfolioUpdate),
                serviceFetchFailed: Boolean(item.serviceFetchFailed),
                portfolioFetchFailed: Boolean(item.portfolioFetchFailed),
                profileFetchedAt: Number(item.profileFetchedAt) || 0,
                createdAt: Number(item.createdAt) || Date.now()
            }];
        });
    }

    function loadSettings() {
        const raw = GM_getValue(SETTINGS_KEY, {});
        return {
            minHeight: clamp(Number(raw?.minHeight) || 220, 120, 520),
            rowHeight: clamp(Number(raw?.rowHeight) || 52, 42, 88),
            collapsed: Boolean(raw?.collapsed),
            keepUnread: Boolean(raw?.keepUnread),
            reactionMarkRead: Boolean(raw?.reactionMarkRead)
        };
    }

    function saveClients() {
        GM_setValue(CLIENTS_KEY, clients);
    }

    function saveSettings() {
        GM_setValue(SETTINGS_KEY, settings);
    }

    function makeID() {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
        return `vgt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }

    function parseClientLink(value) {
        let raw = String(value || '').trim();
        if (!raw) throw new Error('请粘贴客户的 VGen 主页链接');

        if (/^@[A-Za-z0-9_.-]+$/.test(raw)) raw = raw.slice(1);
        if (/^[A-Za-z0-9_.-]+$/.test(raw)) raw = `https://vgen.co/${raw}`;
        if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

        let url;
        try {
            url = new URL(raw);
        } catch {
            throw new Error('无法识别这个链接');
        }

        const hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, '');
        if (hostname !== 'vgen.co') throw new Error('请使用 vgen.co 的用户主页链接');

        const parts = url.pathname.split('/').filter(Boolean).map((part) => {
            try {
                return decodeURIComponent(part);
            } catch {
                return part;
            }
        });

        let username = parts[0] || '';
        if (username.toLocaleLowerCase() === 'profile') username = parts[1] || '';
        username = username.trim().replace(/^@/, '');

        if (!username || RESERVED_PATHS.has(username.toLocaleLowerCase())) {
            throw new Error('这个链接不是 VGen 用户主页');
        }
        if (!/^[A-Za-z0-9_.-]+$/.test(username)) {
            throw new Error('链接中的用户名格式无法识别');
        }

        return {
            id: makeID(),
            username,
            url: `https://vgen.co/${encodeURIComponent(username)}`,
            note: '',
            userID: '',
            displayName: '',
            avatarURL: '',
            bannerURL: '',
            announcementMessage: '',
            announcementModified: '',
            lastServiceUpdate: '',
            lastPortfolioUpdate: '',
            serviceFetchFailed: false,
            portfolioFetchFailed: false,
            profileFetchedAt: 0,
            createdAt: Date.now()
        };
    }

    function createPanel() {
        const panel = document.createElement('section');
        panel.id = PANEL_ID;
        panel.className = 'notranslate';
        panel.translate = false;
        panel.setAttribute('aria-label', '常用访问');
        panel.innerHTML = `
            <div class="vgt-shell">
                <div class="vgt-accent" aria-hidden="true"></div>
                <header class="vgt-header">
                    <h2 class="vgt-title"><span class="vgt-title-dot" aria-hidden="true"></span>常用访问</h2>
                    <div class="vgt-header-actions">
                        <button class="vgt-icon-button vgt-refresh-all" type="button" aria-label="刷新全部用户资料" title="刷新全部用户资料"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 5.5A5.5 5.5 0 1 0 13.2 10" stroke-width="1.6" stroke-linecap="round"/><path d="M10.4 3.2H13v2.6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                        <button class="vgt-icon-button vgt-manage" type="button" aria-label="管理常用访问" title="添加、备注、排序与设置"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="8" r="1.25" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none"/><circle cx="13" cy="8" r="1.25" fill="currentColor" stroke="none"/></svg></button>
                        <button class="vgt-icon-button vgt-collapse" type="button" aria-label="折叠常用访问" title="折叠"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
                    </div>
                </header>
                <ul class="vgt-list"></ul>
            </div>
        `;

        panel.querySelector('.vgt-manage').addEventListener('click', openClientManager);
        panel.querySelector('.vgt-refresh-all').addEventListener('click', async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                await refreshStaleClients(true);
            } finally {
                button.disabled = false;
            }
        });
        panel.querySelector('.vgt-collapse').addEventListener('click', () => {
            settings.collapsed = !settings.collapsed;
            saveSettings();
            applyPanelSettings(panel);
        });

        applyPanelSettings(panel);
        renderClientList(panel);
        return panel;
    }

    function applyPanelSettings(panel = document.getElementById(PANEL_ID)) {
        if (!panel) return;
        const minHeight = `${settings.minHeight}px`;
        const rowHeight = `${settings.rowHeight}px`;
        const collapsed = String(settings.collapsed);
        if (panel.style.getPropertyValue('--vgt-min-height') !== minHeight) panel.style.setProperty('--vgt-min-height', minHeight);
        if (panel.style.getPropertyValue('--vgt-row-height') !== rowHeight) panel.style.setProperty('--vgt-row-height', rowHeight);
        if (panel.dataset.collapsed !== collapsed) panel.dataset.collapsed = collapsed;
        const button = panel.querySelector('.vgt-collapse');
        if (button) {
            const title = settings.collapsed ? '从下往上展开' : '折叠';
            const label = settings.collapsed ? '展开常用访问' : '折叠常用访问';
            if (button.title !== title) button.title = title;
            if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
        }
    }

    function createAvatarChatButton(client, avatar) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'vgt-avatar-chat'; button.dataset.vgtUi = 'frequent-chat';
        button.title = `私信 @${client.username}`; button.setAttribute('aria-label', button.title);
        const badge = document.createElement('span'); badge.className = 'vgt-avatar-chat-badge'; badge.setAttribute('aria-hidden', 'true');
        // Exact paths from VGen's public IconCustomChat, without styled-component classes.
        badge.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="M9 10.75H7V12.75H9V10.75Z"></path><path d="M17 10.75H15V12.75H17V10.75Z"></path><path d="M11 12.75V10.75H13V12.75H11Z"></path><path fill-rule="evenodd" clip-rule="evenodd" d="M8.29922 20.9596C7.84664 21.225 7.22686 21.5885 6.14522 21.8081C6.07456 21.8224 6.00193 21.8361 5.92724 21.8492C5.39778 21.9417 4.76512 22 4 22C3.89534 22 3.91475 21.8755 4 21.6675C4.05575 21.5314 4.13965 21.3597 4.23543 21.1636C4.38199 20.8635 4.55636 20.5065 4.70015 20.1336C4.72034 20.0813 4.73993 20.0286 4.75875 19.9757C5.02425 19.2299 5.1377 18.4443 4.64567 17.9372C3.00321 16.2446 2 13.9836 2 11.5C2 6.25329 6.47715 2 12 2C17.5228 2 22 6.25329 22 11.5C22 16.7467 17.5228 21 12 21C11.0721 21 10.1738 20.8799 9.32124 20.6553C8.97405 20.5638 8.70327 20.7226 8.29922 20.9596ZM20 11.5C20 15.5467 16.5162 19 12 19C11.2452 19 10.5181 18.9024 9.83083 18.7213C8.93205 18.4845 8.2064 18.7506 7.76571 18.9694C7.59023 19.0565 7.41511 19.1594 7.29784 19.2283L7.26699 19.2464C7.15145 19.3141 7.05242 19.3715 6.94859 19.4268C6.95468 19.3806 6.9601 19.3342 6.96478 19.2875C7.04212 18.5173 6.93803 17.4277 6.081 16.5445C4.77622 15.1998 4 13.4295 4 11.5C4 7.45329 7.48382 4 12 4C16.5162 4 20 7.45329 20 11.5Z"></path></svg>';
        button.append(avatar, badge);
        button.addEventListener('click', async (event) => {
            event.preventDefault(); event.stopPropagation();
            if (button.disabled) return;
            button.disabled = true;
            try {
                if (!client.userID) await refreshClient(client.id, true);
                if (!client.userID) { showToast('无法取得用户资料'); return; }
                const result = await sendSiteDiagnosticCommand('chat:open', { userID: client.userID }, 45000);
                if (result.status !== 'ok') {
                    const reasons = { 'sign-in-required': '请先登录 VGen', 'cannot-chat-with-self': '不能向自己发起私信',
                        'native-verification-unavailable': '请通过该用户主页的原生私信按钮完成验证',
                        'native-chat-restricted': 'VGen 当前不允许此账号发起私信' };
                    showToast(reasons[result.data?.reason] || '无法打开原生私信，请通过用户主页重试');
                }
            } finally { button.disabled = false; }
        });
        return button;
    }

    function renderClientList(panel = document.getElementById(PANEL_ID)) {
        if (!panel) return;
        const list = panel.querySelector('.vgt-list');
        list.replaceChildren();

        if (!clients.length) {
            const empty = document.createElement('li');
            empty.className = 'vgt-empty';
            empty.textContent = '点击右上角＋添加常用访问';
            list.append(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        clients.forEach((client) => {
            const row = document.createElement('li');
            row.className = 'vgt-row';
            row.dataset.clientId = client.id;
            if (client.bannerURL) row.style.backgroundImage = `url(${JSON.stringify(client.bannerURL)})`;

            const link = document.createElement('a');
            link.className = 'vgt-client-link';
            link.href = client.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = `新标签页打开 @${client.username}`;

            const avatar = document.createElement('img');
            avatar.className = 'vgt-avatar';
            avatar.alt = '';
            avatar.loading = 'lazy';
            avatar.referrerPolicy = 'no-referrer';
            avatar.src = client.avatarURL || defaultAvatarDataURL();
            avatar.addEventListener('error', () => {
                if (avatar.src !== defaultAvatarDataURL()) avatar.src = defaultAvatarDataURL();
            }, { once: true });

            const text = document.createElement('span');
            text.className = 'vgt-client-text';

            const name = document.createElement('span');
            name.className = 'vgt-client-name';
            name.textContent = client.note || client.displayName || `@${client.username}`;

            const hint = document.createElement('span');
            hint.className = 'vgt-client-hint';
            hint.textContent = `@${client.username}`;

            const identity = document.createElement('span');
            identity.className = 'vgt-client-identity';
            identity.append(name, hint);

            const announcement = document.createElement('span');
            announcement.className = 'vgt-client-announcement';
            const announcementText = compactText(client.announcementMessage);
            announcement.textContent = announcementText ? `通知：${announcementText}` : '';
            announcement.hidden = !announcementText;
            announcement.title = announcementText || '';

            const updates = document.createElement('span');
            updates.className = 'vgt-client-updates';
            updates.textContent = formatUpdateSummary(client);

            text.append(identity, announcement, updates);
            link.append(text);
            row.append(createAvatarChatButton(client, avatar), link);
            fragment.append(row);
        });
        list.append(fragment);
    }

    function createClientManager() {
        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'notranslate';
        modal.translate = false;
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'vgt-manager-title');
        modal.innerHTML = `
            <section class="vgt-dialog">
                <header class="vgt-dialog-header">
                    <h2 id="vgt-manager-title">管理常用访问</h2>
                    <button class="vgt-close" type="button" aria-label="关闭">×</button>
                </header>
                <div class="vgt-dialog-body">
                    <form class="vgt-add-form">
                        <input class="vgt-url-input" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="VGen 用户主页链接或 @ID" aria-label="用户主页链接">
                        <input class="vgt-add-note" type="text" maxlength="80" autocomplete="off" placeholder="备注（可选）" aria-label="备注">
                        <button class="vgt-primary" type="submit">添加</button>
                    </form>
                    <div class="vgt-manage-list"></div>
                    <div class="vgt-settings">
                        <label class="vgt-setting">
                            <span>列表最小高度</span>
                            <input class="vgt-height-range" type="range" min="120" max="520" step="10">
                            <output class="vgt-height-value"></output>
                        </label>
                        <label class="vgt-setting">
                            <span>单个条目高度</span>
                            <input class="vgt-row-height-range" type="range" min="42" max="88" step="2">
                            <output class="vgt-row-height-value"></output>
                        </label>
                    </div>
                </div>
                <footer class="vgt-dialog-footer">
                    <button class="vgt-secondary vgt-refresh" type="button">刷新资料</button>
                    <button class="vgt-primary vgt-done" type="button">完成</button>
                </footer>
            </section>
        `;

        const close = () => closeClientManager(modal);
        modal.querySelector('.vgt-close').addEventListener('click', close);
        modal.querySelector('.vgt-done').addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });
        modal.querySelector('.vgt-add-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const urlInput = modal.querySelector('.vgt-url-input');
            const noteInput = modal.querySelector('.vgt-add-note');
            try {
                const client = parseClientLink(urlInput.value);
                if (clients.some((item) => item.username.localeCompare(client.username, undefined, { sensitivity: 'accent' }) === 0)) {
                    throw new Error(`@${client.username} 已在常用访问中`);
                }
                client.note = noteInput.value.trim().slice(0, 80);
                clients.push(client);
                saveClients();
                urlInput.value = '';
                noteInput.value = '';
                renderClientList();
                renderManagerList(modal);
                showToast(`已添加 @${client.username}`);
                await refreshClient(client.id, true);
            } catch (error) {
                showToast(error instanceof Error ? error.message : '添加失败');
            }
        });

        const range = modal.querySelector('.vgt-height-range');
        range.addEventListener('input', () => {
            settings.minHeight = clamp(Number(range.value), 120, 520);
            modal.querySelector('.vgt-height-value').textContent = `${settings.minHeight}px`;
            saveSettings();
            applyPanelSettings();
        });
        const rowHeightRange = modal.querySelector('.vgt-row-height-range');
        rowHeightRange.addEventListener('input', () => {
            settings.rowHeight = clamp(Number(rowHeightRange.value), 42, 88);
            modal.querySelector('.vgt-row-height-value').textContent = `${settings.rowHeight}px`;
            saveSettings();
            applyPanelSettings();
        });
        modal.querySelector('.vgt-refresh').addEventListener('click', async () => {
            await refreshStaleClients(true);
            renderManagerList(modal);
        });
        document.body.append(modal);
        return modal;
    }

    function openClientManager() {
        const modal = document.getElementById(MODAL_ID) || createClientManager();
        modal.dataset.theme = detectDarkSurface(document.getElementById(PANEL_ID)?.parentElement || document.body) ? 'dark' : 'light';
        const range = modal.querySelector('.vgt-height-range');
        range.value = String(settings.minHeight);
        modal.querySelector('.vgt-height-value').textContent = `${settings.minHeight}px`;
        const rowHeightRange = modal.querySelector('.vgt-row-height-range');
        rowHeightRange.value = String(settings.rowHeight);
        modal.querySelector('.vgt-row-height-value').textContent = `${settings.rowHeight}px`;
        renderManagerList(modal);
        modal.hidden = false;
        document.documentElement.style.overflow = 'hidden';
        requestAnimationFrame(() => modal.querySelector('.vgt-url-input')?.focus());
    }

    function closeClientManager(modal = document.getElementById(MODAL_ID)) {
        if (!modal) return;
        modal.hidden = true;
        document.documentElement.style.removeProperty('overflow');
    }

    function renderManagerList(modal = document.getElementById(MODAL_ID)) {
        if (!modal) return;
        const list = modal.querySelector('.vgt-manage-list');
        list.replaceChildren();
        if (!clients.length) {
            const empty = document.createElement('div');
            empty.className = 'vgt-empty-manage';
            empty.textContent = '还没有常用访问用户';
            list.append(empty);
            return;
        }

        clients.forEach((client) => {
            const row = document.createElement('div');
            row.className = 'vgt-manage-row';
            row.dataset.clientId = client.id;
            row.draggable = false;

            const handle = document.createElement('button');
            handle.className = 'vgt-drag';
            handle.type = 'button';
            handle.textContent = '⠿';
            handle.title = '拖动排序';
            handle.setAttribute('aria-label', `拖动 @${client.username} 排序`);
            handle.addEventListener('pointerdown', () => { row.draggable = true; });
            handle.addEventListener('pointerup', () => { row.draggable = false; });

            const avatar = document.createElement('img');
            avatar.className = 'vgt-manage-avatar';
            avatar.alt = '';
            avatar.src = client.avatarURL || defaultAvatarDataURL();

            const noteWrap = document.createElement('div');
            noteWrap.className = 'vgt-note-wrap';
            const note = document.createElement('input');
            note.className = 'vgt-note-input';
            note.type = 'text';
            note.maxLength = 80;
            note.value = client.note || '';
            note.placeholder = client.displayName ? `备注（当前：${client.displayName}）` : '添加备注';
            note.setAttribute('aria-label', `@${client.username} 的备注`);
            note.addEventListener('input', () => {
                client.note = note.value.slice(0, 80);
                saveClients();
                renderClientList();
            });
            const original = document.createElement('div');
            original.className = 'vgt-original-id';
            original.textContent = `原 ID：@${client.username}${client.displayName && client.displayName !== client.username ? ` · ${client.displayName}` : ''}`;
            noteWrap.append(note, original);

            const refresh = document.createElement('button');
            refresh.className = 'vgt-row-refresh';
            refresh.type = 'button';
            refresh.textContent = '↻';
            refresh.title = `刷新 @${client.username} 的资料`;
            refresh.setAttribute('aria-label', `刷新 @${client.username} 的资料`);
            refresh.addEventListener('click', async () => {
                refresh.disabled = true;
                try {
                    await refreshClient(client.id, true);
                    showToast(`已刷新 @${client.username}`);
                } finally {
                    refresh.disabled = false;
                }
            });

            const remove = document.createElement('button');
            remove.className = 'vgt-delete';
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = `删除 @${client.username}`;
            remove.setAttribute('aria-label', `删除 @${client.username}`);
            remove.addEventListener('click', () => {
                if (!window.confirm(`从常用访问中删除 @${client.username}？`)) return;
                clients = clients.filter((item) => item.id !== client.id);
                saveClients();
                renderClientList();
                renderManagerList(modal);
                showToast(`已删除 @${client.username}`);
            });

            row.addEventListener('dragstart', (event) => {
                row.classList.add('is-dragging');
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', client.id);
            });
            row.addEventListener('dragend', () => {
                row.classList.remove('is-dragging');
                row.draggable = false;
                commitManagerOrder(list);
            });
            row.addEventListener('dragover', (event) => {
                event.preventDefault();
                const dragging = list.querySelector('.is-dragging');
                if (!dragging || dragging === row) return;
                const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
                list.insertBefore(dragging, after ? row.nextSibling : row);
            });

            row.append(handle, avatar, noteWrap, refresh, remove);
            list.append(row);
        });
    }

    function commitManagerOrder(list) {
        const order = [...list.querySelectorAll('.vgt-manage-row')].map((row) => row.dataset.clientId);
        if (order.length !== clients.length) return;
        const byID = new Map(clients.map((client) => [client.id, client]));
        clients = order.map((id) => byID.get(id)).filter(Boolean);
        saveClients();
        renderClientList();
    }

    async function refreshStaleClients(force = false) {
        if (refreshRunning || !clients.length) return;
        refreshRunning = true;
        try {
            const pending = clients.filter((client) => force || Date.now() - client.profileFetchedAt >= PROFILE_CACHE_MS);
            for (let index = 0; index < pending.length; index += 3) {
                await Promise.allSettled(pending.slice(index, index + 3).map((client) => refreshClient(client.id, force)));
            }
            if (force) showToast('常用访问资料已刷新');
        } finally {
            refreshRunning = false;
        }
    }

    async function refreshClient(clientID, force = false) {
        const client = clients.find((item) => item.id === clientID);
        if (!client || (!force && Date.now() - client.profileFetchedAt < PROFILE_CACHE_MS)) return;
        try {
            const profile = await apiJSON(`/user/${encodeURIComponent(client.username)}`);
            if (!profile?.userID) throw new Error('用户资料不存在');

            const [servicesResult, showcasesResult] = await Promise.allSettled([
                apiJSON(`/commission/services/${encodeURIComponent(profile.userID)}`),
                apiJSON(`/discoverability/portfolio/showcases/${encodeURIComponent(profile.userID)}?limit=1&verifyAge=true`)
            ]);
            let latestService = client.lastServiceUpdate;
            if (servicesResult.status === 'fulfilled' && Array.isArray(servicesResult.value)) {
                latestService = servicesResult.value.reduce((latest, service) => maxDateString(latest, service?.modified || service?.created), '');
            }
            let latestPortfolio = client.lastPortfolioUpdate;
            if (showcasesResult.status === 'fulfilled') {
                const showcase = showcasesResult.value?.showcases?.[0];
                latestPortfolio = normaliseDateString(showcase?.modified || showcase?.created);
            }

            Object.assign(client, {
                userID: profile.userID,
                username: String(profile.username || client.username),
                url: `https://vgen.co/${encodeURIComponent(profile.username || client.username)}`,
                displayName: String(profile.displayName || ''),
                avatarURL: safeRemoteURL(profile.avatarURL),
                bannerURL: safeRemoteURL(profile.bannerURL),
                announcementMessage: String(profile.announcement?.message || '').slice(0, 500),
                announcementModified: normaliseDateString(profile.announcement?.modified),
                lastServiceUpdate: latestService,
                lastPortfolioUpdate: latestPortfolio,
                serviceFetchFailed: servicesResult.status === 'rejected',
                portfolioFetchFailed: showcasesResult.status === 'rejected',
                profileFetchedAt: Date.now()
            });
            saveClients();
            renderClientList();
            if (!document.getElementById(MODAL_ID)?.hidden) renderManagerList();
        } catch (error) {
            console.warn(PREFIX, `刷新 @${client.username} 失败`, error);
            client.serviceFetchFailed = !client.lastServiceUpdate;
            client.portfolioFetchFailed = !client.lastPortfolioUpdate;
            client.profileFetchedAt = Date.now() - PROFILE_CACHE_MS + 15 * 60 * 1000;
            saveClients();
            if (force) showToast(`@${client.username} 资料刷新失败`);
        }
    }

    async function apiJSON(path) {
        const response = await fetch(`${API_BASE}${path}`, {
            method: 'GET',
            headers: API_HEADERS,
            credentials: 'include',
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`VGen API ${response.status}`);
        return response.json();
    }

    function formatUpdateSummary(client) {
        const service = client.lastServiceUpdate ? formatRelativeDate(client.lastServiceUpdate) : (client.serviceFetchFailed ? '获取失败' : '无记录');
        const portfolio = client.lastPortfolioUpdate ? formatRelativeDate(client.lastPortfolioUpdate) : (client.portfolioFetchFailed ? '获取失败' : '无记录');
        return `橱窗 ${service} · 作品 ${portfolio}`;
    }

    function compactText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function formatRelativeDate(value) {
        const timestamp = Date.parse(value || '');
        if (!Number.isFinite(timestamp)) return '—';
        const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
        if (seconds < 60) return '刚刚';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}时前`;
        if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}天前`;
        return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(timestamp));
    }

    function normaliseDateString(value) {
        const timestamp = Date.parse(String(value || ''));
        return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
    }

    function maxDateString(left, right) {
        const leftTime = Date.parse(left || '') || 0;
        const rightTime = Date.parse(right || '') || 0;
        return normaliseDateString(rightTime > leftTime ? right : left);
    }

    function safeRemoteURL(value) {
        try {
            const url = new URL(String(value || ''));
            return url.protocol === 'https:' ? url.href : '';
        } catch {
            return '';
        }
    }

    function defaultAvatarDataURL() {
        return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"%3E%3Crect width="48" height="48" rx="12" fill="%23363847"/%3E%3Ccircle cx="24" cy="18" r="8" fill="%2399a2b6"/%3E%3Cpath d="M10 43c1-10 6-15 14-15s13 5 14 15" fill="%2399a2b6"/%3E%3C/svg%3E';
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function findPanelMount() {
        const legacyFooter = document.querySelector('[class*="CreatorSidebar__SidebarFooter"]');
        if (legacyFooter?.parentElement) {
            return { parent: legacyFooter.parentElement, before: legacyFooter, kind: 'legacy' };
        }

        const modernSidebar = document.querySelector('[class*="DesktopSidebar__Sidebar"]');
        const modernFooter = modernSidebar?.querySelector(':scope > .sidebarFooter');
        if (modernSidebar && modernFooter) {
            return { parent: modernSidebar, before: modernFooter, kind: 'modern' };
        }

        return null;
    }

    function ensurePanel() {
        const mount = findPanelMount();
        const existing = document.getElementById(PANEL_ID);

        if (!mount) {
            if (existing && !existing.isConnected) existing.remove();
            return false;
        }

        const panel = existing || createPanel();
        if (panel.parentElement !== mount.parent || panel.nextElementSibling !== mount.before) {
            mount.parent.insertBefore(panel, mount.before);
        }
        mount.parent.classList.add('vgt-has-panel');
        panel.dataset.mount = mount.kind;
        syncPanelTheme(panel, mount.parent);
        applyPanelSettings(panel);
        void refreshStaleClients(false);
        return true;
    }

    function syncPanelTheme(panel, context) {
        const theme = detectDarkSurface(context) ? 'dark' : 'light';
        if (panel.dataset.theme !== theme) panel.dataset.theme = theme;
    }

    function detectDarkSurface(start) {
        let node = start;
        for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
            const colour = getComputedStyle(node).backgroundColor;
            const rgb = parseRGB(colour);
            if (!rgb || rgb.a < 0.08) continue;
            return (rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722) < 128;
        }
        const bodyColour = parseRGB(getComputedStyle(document.body).backgroundColor);
        return bodyColour ? (bodyColour.r * 0.2126 + bodyColour.g * 0.7152 + bodyColour.b * 0.0722) < 128 : true;
    }

    function parseRGB(value) {
        const match = String(value || '').match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
        if (!match) return null;
        return {
            r: Number(match[1]),
            g: Number(match[2]),
            b: Number(match[3]),
            a: match[4] === undefined ? 1 : Number(match[4])
        };
    }

    function installSiteDiagnosticBridge() {
        if (siteDiagnosticRuntime.bridgeInstalled) return;
        siteDiagnosticRuntime.bridgeInstalled = true;
        window.addEventListener(siteDiagResultEvent, handleSiteDiagnosticResult);

        const bridgeFactory = function bridgeFactory(commandEvent, resultEvent, initialSettings = {}) {
            const existing = window.__vgtSiteDiagnosticV060;
            if (existing) {
                window.dispatchEvent(new CustomEvent(resultEvent, {
                    detail: JSON.stringify({ id: 'bridge', status: 'ready', data: existing.snapshot() })
                }));
                return;
            }

            const MAX_EVENTS = 2400;
            const SAFE_ROUTE_SEGMENTS = new Set([
                'creator', 'commissions', 'services', 'messages', 'portfolio', 'dashboard',
                'settings', 'notifications', 'requests', 'orders', 'shop', 'saved', 'search',
                'catalogue', 'upload', 'new', 'edit', 'login', 'signup', 'about', 'artists',
                'api', 'user', 'chats', 'channels', 'messaging', 'message', 'messages',
                'read', 'event', 'query', 'pinned_messages', 'reaction', 'reactions'
            ]);
            const diagnostic = {
                active: false,
                startedAt: null,
                endedAt: null,
                sequence: 0,
                droppedCount: 0,
                events: []
            };
            const readControl = {
                enabled: Boolean(initialSettings.keepUnread),
                reactionMarkRead: Boolean(initialSettings.reactionMarkRead),
                generation: 0, confirmations: new Map(),
                pendingReads: new Map(), manualPermits: new Map(), approvedThrough: new Map(), reactions: new Map(),
                channelHooks: new Map(), invocationSource: null
            };
            let requestSequence = 0;
            const SESSION_KEY = 'vgt-site-diagnostic-v060-active-run';
            let persistenceTimer = 0;
            let resumedFromSession = false;

            try {
                const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
                if (stored?.schema === 1 && stored.active && stored.startedAt?.epoch) {
                    diagnostic.active = true;
                    diagnostic.startedAt = stored.startedAt;
                    diagnostic.sequence = Number(stored.sequence || 0);
                    diagnostic.droppedCount = Number(stored.droppedCount || 0);
                    diagnostic.events = Array.isArray(stored.events)
                        ? stored.events.slice(-MAX_EVENTS)
                        : [];

                    resumedFromSession = true;
                }
            } catch {
                // A blocked or unavailable sessionStorage must not affect VGen.
            }

            const shortHash = (value) => {
                const text = String(value || '');
                let hash = 2166136261;
                for (let index = 0; index < text.length; index += 1) {
                    hash ^= text.charCodeAt(index);
                    hash = Math.imul(hash, 16777619);
                }
                return (hash >>> 0).toString(36).slice(0, 8);
            };

            const safeIdentifier = (value) => value === undefined || value === null || value === ''
                ? undefined
                : 'id#' + shortHash(value);

            const sanitiseRoutePath = (pathname) => {
                const segments = String(pathname || '/').split('/').filter(Boolean);
                if (!segments.length) return '/';
                return '/' + segments.map((segment) => {
                    const decoded = (() => {
                        try {
                            return decodeURIComponent(segment);
                        } catch {
                            return segment;
                        }
                    })();
                    if (SAFE_ROUTE_SEGMENTS.has(decoded.toLowerCase())) return decoded;
                    return ':id#' + shortHash(decoded);
                }).join('/');
            };

            const classifyPage = (pathname) => {
                const path = String(pathname || '/');
                if (/^\/messages(?:\/|$)/i.test(path)) return 'messages';
                if (/^\/creator\/commissions\/services(?:\/|$)/i.test(path)) return 'creator-services';
                if (/^\/creator\/commissions(?:\/|$)/i.test(path)) return 'creator-commissions';
                if (/^\/creator\/portfolio(?:\/|$)/i.test(path)) return 'creator-portfolio';
                if (/^\/creator(?:\/|$)/i.test(path)) return 'creator';
                if (/^\/settings(?:\/|$)/i.test(path)) return 'settings';
                if (/^\/notifications?(?:\/|$)/i.test(path)) return 'notifications';
                if (/^\/(?:shop|catalogue)(?:\/|$)/i.test(path)) return 'marketplace';
                if (path === '/') return 'home';
                return 'other';
            };

            const routeSnapshot = () => ({
                pageType: classifyPage(location.pathname),
                pathname: sanitiseRoutePath(location.pathname)
            });

            const safeURL = (value) => {
                try {
                    const parsed = new URL(String(value || ''), location.href);
                    let pathname = parsed.pathname;
                    pathname = pathname.replace(
                        /\/channels\/([^/]+)\/([^/]+)/i,
                        (match, type, id) => '/channels/' + type + '/:channel#' + shortHash(id)
                    );
                    pathname = pathname.replace(
                        /\/messages\/([^/]+)/i,
                        (match, id) => '/messages/:message#' + shortHash(id)
                    );
                    pathname = pathname.replace(
                        /\/user\/chats\/([^/]+)/i,
                        (match, id) => '/user/chats/:id#' + shortHash(id)
                    );
                    pathname = pathname.replace(
                        /\/users?\/(?!chats(?:\/|$))([^/]+)/i,
                        (match, id) => match.split('/').slice(0, -1).join('/') + '/:id#' + shortHash(id)
                    );
                    pathname = pathname.replace(
                        /\/([0-9a-f]{8}-[0-9a-f-]{27,}|[A-Za-z0-9_-]{18,})(?=\/|$)/gi,
                        (match, id) => '/:id#' + shortHash(id)
                    );
                    const host = parsed.hostname.toLowerCase();
                    const scope = /(^|\.)vgen\.co$/i.test(host)
                        ? 'vgen'
                        : /(^|\.)stream-io-api\.com$/i.test(host) ? 'stream' : 'external';
                    if (scope === 'external') {
                        pathname = '/:external-path#' + shortHash(pathname);
                    } else {
                        const endpointWords = new Set(['connect', 'all', 'discoverability', 'reviews', 'client',
                            'clients', 'showcases', 'commission', 'file', 'image', 'upload', 'unread', 'members',
                            'watch', 'stop-watching', 'search', 'count', 'v1', 'v2', 'v3', 'auth', 'login',
                            'settings', 'draft', 'drafts', 'notifications', 'preferences', 'profile', 'billing']);
                        pathname = '/' + pathname.split('/').filter(Boolean).map((part) =>
                            /^:(?:id|channel|message)#[a-z0-9]+$/.test(part)
                            || SAFE_ROUTE_SEGMENTS.has(part.toLowerCase()) || endpointWords.has(part.toLowerCase())
                                ? part : ':id#' + shortHash(part)).join('/');
                    }
                    return {
                        endpoint: parsed.origin + pathname,
                        queryKeys: [...new Set([...parsed.searchParams.keys()])].sort(),
                        scope
                    };
                } catch {
                    return { endpoint: 'unparseable-url', queryKeys: [], scope: 'unknown' };
                }
            };

            const channelKeyFromURL = (value) => {
                try {
                    const parsed = new URL(String(value || ''), location.href);
                    const match = parsed.pathname.match(/\/channels\/([^/]+)\/([^/]+)(?:\/|$)/i);
                    if (match) return decodeURIComponent(match[1]) + ':' + decodeURIComponent(match[2]);
                    if (/\/channels\/read$/i.test(parsed.pathname)) return '__all_channels__';
                } catch {
                    // ignored
                }
                return '__unknown_channel__';
            };

            const isReadRequest = (method, value) => {
                try {
                    const parsed = new URL(String(value || ''), location.href);
                    return String(method || '').toUpperCase() === 'POST'
                        && /(^|\.)stream-io-api\.com$/i.test(parsed.hostname)
                        && (/\/channels\/[^/]+\/[^/]+\/read$/i.test(parsed.pathname)
                            || /\/channels\/read$/i.test(parsed.pathname));
                } catch {
                    return false;
                }
            };

            const isMessageSendRequest = (method, value) => {
                try {
                    const parsed = new URL(String(value || ''), location.href);
                    return String(method || '').toUpperCase() === 'POST'
                        && /(^|\.)stream-io-api\.com$/i.test(parsed.hostname)
                        && /\/channels\/[^/]+\/[^/]+\/message$/i.test(parsed.pathname);
                } catch {
                    return false;
                }
            };

            const pickCount = (value) => Number.isFinite(Number(value)) ? Number(value) : undefined;

            const safeAction = (value) => typeof value === 'string'
                && /^[A-Za-z0-9_.:-]{1,100}$/.test(value)
                ? value
                : undefined;

            const summariseObject = (value) => {
                if (!value || typeof value !== 'object') return {};
                if (Array.isArray(value)) {
                    const first = value.length ? summariseObject(value[0]) : {};
                    return { arrayLength: value.length, ...first };
                }
                const message = value.message && typeof value.message === 'object' ? value.message : null;
                const channel = value.channel && typeof value.channel === 'object' ? value.channel : null;
                const user = value.user && typeof value.user === 'object' ? value.user : null;
                const nestedEvent = value.event && typeof value.event === 'object' ? value.event : null;
                const summary = {
                    type: safeAction(value.type || nestedEvent?.type),
                    operationName: safeAction(value.operationName),
                    action: safeAction(value.action),
                    keys: Object.keys(value).sort().slice(0, 60),
                    variableKeys: value.variables && typeof value.variables === 'object'
                        ? Object.keys(value.variables).sort().slice(0, 60)
                        : undefined,
                    cid: safeIdentifier(value.cid || channel?.cid),
                    channelId: safeIdentifier(value.channel_id || value.channelId || channel?.id),
                    messageId: safeIdentifier(value.message_id || value.messageId || message?.id),
                    userId: safeIdentifier(value.user_id || value.userId || user?.id),
                    totalUnreadCount: pickCount(value.total_unread_count),
                    unreadChannels: pickCount(value.unread_channels),
                    unreadMessages: pickCount(value.unread_messages),
                    createdAt: safeTime(value.created_at),
                    lastRead: safeTime(value.last_read),
                    lastReadMessageId: safeIdentifier(value.last_read_message_id),
                    reactionType: safeAction(value.reaction?.type),
                    senderId: safeIdentifier(message?.user?.id || message?.user_id),
                    messageCreatedAt: safeTime(message?.created_at),
                    hasMessageText: message ? typeof message.text === 'string' && message.text.length > 0 : undefined,
                    attachmentCount: message && Array.isArray(message.attachments) ? message.attachments.length : undefined,
                    messageKeys: message ? Object.keys(message).sort().slice(0, 60) : undefined
                };
                return Object.fromEntries(Object.entries(summary).filter((entry) => entry[1] !== undefined));
            };

            const summarisePayload = (value) => {
                if (value === undefined || value === null) return undefined;
                if (typeof value === 'string') {
                    if (value.length > 200000) return { format: 'text', length: value.length, parsed: false };
                    try {
                        return { format: 'json', ...summariseObject(JSON.parse(value)) };
                    } catch {
                        return { format: 'text', length: value.length, parsed: false };
                    }
                }
                if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
                    return { format: 'urlencoded', keys: [...new Set([...value.keys()])].sort() };
                }
                if (typeof FormData !== 'undefined' && value instanceof FormData) {
                    return { format: 'form-data', keys: [...new Set([...value.keys()])].sort() };
                }
                if (typeof Blob !== 'undefined' && value instanceof Blob) {
                    return { format: 'blob', size: value.size, mimeType: value.type || undefined };
                }
                if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
                    return { format: 'binary', byteLength: value.byteLength };
                }
                if (typeof value === 'object') return { format: 'object', ...summariseObject(value) };
                return { format: typeof value };
            };

            const persistNow = () => {
                persistenceTimer = 0;
                try {
                    if (!diagnostic.active) {
                        sessionStorage.removeItem(SESSION_KEY);
                        return;
                    }
                    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                        schema: 1,
                        active: true,
                        startedAt: diagnostic.startedAt,
                        sequence: diagnostic.sequence,
                        droppedCount: diagnostic.droppedCount,
                        events: diagnostic.events
                    }));
                } catch {
                    // The in-memory diagnostic remains usable if storage quota is unavailable.
                }
            };

            const schedulePersistence = () => {
                if (!diagnostic.active || persistenceTimer) return;
                persistenceTimer = window.setTimeout(persistNow, 250);
            };

            const push = (source, category, eventName, data) => {
                if (!diagnostic.active) return;
                const route = routeSnapshot();
                const item = {
                    sequence: ++diagnostic.sequence,
                    at: new Date().toISOString(),
                    sinceStartMs: Math.max(0, Date.now() - diagnostic.startedAt.epoch),
                    source,
                    category,
                    event: eventName,
                    page: route.pageType,
                    ...data
                };
                if (diagnostic.events.length >= MAX_EVENTS) {
                    diagnostic.events.shift();
                    diagnostic.droppedCount += 1;
                }
                diagnostic.events.push(item);
                schedulePersistence();
            };

            const buildSummary = () => {
                const bySource = {};
                const byCategory = {};
                const byEvent = {};
                let errors = 0;
                diagnostic.events.forEach((item) => {
                    bySource[item.source] = (bySource[item.source] || 0) + 1;
                    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
                    byEvent[item.event] = (byEvent[item.event] || 0) + 1;
                    if (item.category === 'error' || /\.error$|_ERROR$|_FAILED$/.test(item.event)) errors += 1;
                });
                return {
                    totalEvents: diagnostic.events.length,
                    droppedEvents: diagnostic.droppedCount,
                    httpRequests: byEvent['http.request'] || 0,
                    httpResponses: byEvent['http.response'] || 0,
                    cancelledRequests: byEvent['http.cancelled'] || 0,
                    websocketEvents: bySource.websocket || 0,
                    routeChanges: byEvent.ROUTE_CHANGE || 0,
                    pluginEvents: bySource.plugin || 0,
                    errors,
                    bySource,
                    byCategory,
                    byEvent
                };
            };

            const snapshot = () => ({
                active: diagnostic.active,
                startedAt: diagnostic.startedAt?.iso || null,
                endedAt: diagnostic.endedAt || null,
                durationMs: diagnostic.startedAt
                    ? Math.max(0, (diagnostic.active ? Date.now() : diagnostic.startedAt.endedEpoch) - diagnostic.startedAt.epoch)
                    : 0,
                eventCount: diagnostic.events.length,
                droppedCount: diagnostic.droppedCount,
                summary: buildSummary(),
                readControl: {
                    enabled: readControl.enabled,
                    pendingReadCount: [...readControl.pendingReads.values()]
                        .reduce((total, entries) => total + entries.length, 0),
                    approvedReplyBoundaries: readControl.approvedThrough.size,
                    active: readControl.enabled,
                    reactionMarkRead: readControl.reactionMarkRead,
                    confirmationsPending: readControl.confirmations.size
                },
                privacy: {
                    requestHeaders: false,
                    responseBodies: false,
                    responseStateFieldsOnly: true,
                    responseInspectionLimitBytes: 2000000,
                    messageText: false,
                    formValues: false,
                    attachmentData: false,
                    tokensOrCookies: false,
                    identifiers: 'hashed where structurally identifiable'
                },
                events: diagnostic.events.slice()
            });

            const respond = (id, status, data) => {
                window.dispatchEvent(new CustomEvent(resultEvent, {
                    detail: JSON.stringify({ id, status, data })
                }));
            };

            const emitReadEvent = (eventName, data) => {
                push('plugin', 'read-control', eventName, data || {});
            };

            // One volatile, metadata-only state layer. Never copy message text/attachments.
            const messageState = { selfId: null, channels: new Map(), renderTimer: 0, uiSignatures: new Map() };
            const MAX_CHANNELS = 30;
            const MAX_MESSAGES = 1200;
            const safeTime = (value) => {
                if (value instanceof Date) return Number.isFinite(+value) ? value.toISOString() : null;
                if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)) return null;
                return Number.isFinite(Date.parse(value)) ? value : null;
            };
            // Preserve the server's sub-millisecond precision when present.
            const timeValue = (value) => {
                const iso = safeTime(value);
                if (!iso) return null;
                const fraction = (iso.match(/\.(\d+)Z$/)?.[1] || '').padEnd(9, '0');
                return BigInt(Date.parse(iso.replace(/\.\d+Z$/, 'Z'))) * 1000000n + BigInt(fraction);
            };
            const channelRecord = (cid) => {
                if (!cid || cid.startsWith('__')) return null;
                if (!messageState.channels.has(cid)) {
                    if (messageState.channels.size >= MAX_CHANNELS) messageState.channels.delete(messageState.channels.keys().next().value);
                    messageState.channels.set(cid, { cid, messages: new Map(), reads: new Map(), latest: null, source: null, revision: 0 });
                }
                return messageState.channels.get(cid);
            };
            const channelCID = (channel) => channel?.cid || (channel?.type && channel?.id ? channel.type + ':' + channel.id : null);
            const setSelfId = (id) => {
                if (!id || typeof id !== 'string' || messageState.selfId === id) return;
                if (messageState.selfId) {
                    messageState.channels.clear();
                    readControl.approvedThrough.clear();
                }
                messageState.selfId = id;
                push('plugin', 'message-state', 'SELF_ID_RESOLVED', { userId: safeIdentifier(id) });
            };
            const publicMessage = (m) => ({
                messageId: safeIdentifier(m.id), senderId: safeIdentifier(m.senderId),
                createdAt: m.createdAt, parentId: safeIdentifier(m.parentId), serverConfirmed: m.serverConfirmed
            });
            const rememberMessage = (cid, raw, serverConfirmed = true) => {
                const state = channelRecord(cid);
                if (!state || !raw?.id) return null;
                const old = state.messages.get(raw.id);
                const m = {
                    id: String(raw.id), senderId: raw.user?.id || raw.user_id || old?.senderId || null,
                    createdAt: safeTime(raw.created_at) || old?.createdAt || null,
                    parentId: raw.parent_id || old?.parentId || null,
                    serverConfirmed: serverConfirmed || Boolean(old?.serverConfirmed)
                };
                state.messages.set(m.id, m);
                if (m.serverConfirmed && !old?.serverConfirmed) state.revision += 1;
                const approval = readControl.approvedThrough.get(cid);
                if (approval && m.serverConfirmed && !m.parentId && m.createdAt && m.id !== approval.id
                    && timeValue(m.createdAt) >= timeValue(approval.createdAt)) {
                    readControl.approvedThrough.delete(cid);
                    emitReadEvent('READ_AUTHORIZATION_REVOKED', { conversationId: safeIdentifier(cid), reason: 'new-or-equal-time-message' });
                }
                if (state.messages.size > MAX_MESSAGES) state.messages.delete(state.messages.keys().next().value);
                if (!m.parentId && m.serverConfirmed && m.createdAt) {
                    const latest = state.latest;
                    if (!latest || timeValue(m.createdAt) > timeValue(latest.createdAt)) {
                        state.latest = m;
                        const permit = readControl.approvedThrough.get(cid);
                        if (permit && permit.id !== m.id && timeValue(m.createdAt) > timeValue(permit.createdAt)) {
                            readControl.approvedThrough.delete(cid);
                            emitReadEvent('READ_AUTHORIZATION_REVOKED', { conversationId: safeIdentifier(cid), reason: 'newer-server-message' });
                        }
                    }
                }
                if (JSON.stringify(old) !== JSON.stringify(m)) push('plugin', 'message-state', 'MESSAGE_METADATA_OBSERVED', {
                    conversationId: safeIdentifier(cid), ...publicMessage(m)
                });
                return m;
            };
            const rememberRead = (cid, raw, source, evidenceAt = null, requestStartedAt = null) => {
                const state = channelRecord(cid);
                const userId = raw?.user?.id || raw?.user_id;
                if (!state || typeof userId !== 'string' || !userId) return;
                const lastRead = safeTime(raw.last_read) || safeTime(raw.last_read_at);
                const lastMessageId = raw.last_read_message_id || null;
                if (!lastRead && !lastMessageId) return;
                const previous = state.reads.get(userId);
                // A query started before a newer event must not roll the event back.
                if (previous?.observedAt && requestStartedAt && previous.observedAt > requestStartedAt && previous.source !== 'http-state') return;
                if (requestStartedAt && previous?.requestStartedAt && requestStartedAt < previous.requestStartedAt) return;
                const next = {
                    userId, lastRead, lastMessageId,
                    eventAt: safeTime(evidenceAt), source, observedAt: Date.now(), requestStartedAt
                };
                if (previous?.eventAt && next.eventAt && timeValue(next.eventAt) < timeValue(previous.eventAt)) return;
                if (previous?.lastRead === next.lastRead && previous?.lastMessageId === next.lastMessageId) return;
                state.reads.set(userId, next);
                if (userId === messageState.selfId) confirmReadCursor(cid);
                state.source = source;
                push('plugin', 'message-state', 'READ_CURSOR_UPDATED', {
                    conversationId: safeIdentifier(cid), userId: safeIdentifier(userId),
                    direction: messageState.selfId ? userId === messageState.selfId ? 'self' : 'counterpart' : 'unknown',
                    lastRead, lastReadMessageId: safeIdentifier(lastMessageId), evidence: source
                });
                scheduleMessageRender();
            };
            const observedJSON = (value) => {
                if (typeof value === 'string') {
                    if (value.length > 2000000) return null;
                    try { return JSON.parse(value); } catch { return null; }
                }
                return value && typeof value === 'object' ? value : null;
            };
            const observeServerData = (raw, fallbackCID, source, requestStartedAt = null) => {
                if (!raw || typeof raw !== 'object') return;
                if (raw.me?.id) setSelfId(raw.me.id);
                if (Array.isArray(raw.channels)) {
                    raw.channels.slice(0, MAX_CHANNELS).forEach((entry) => observeServerData(entry, null, source, requestStartedAt));
                }
                const cid = raw.cid || channelCID(raw.channel) || (raw.channel_type && raw.channel_id
                    ? raw.channel_type + ':' + raw.channel_id : fallbackCID);
                if (cid) {
                    // Event order matters even when two messages share the same timestamp.
                    const approval = readControl.approvedThrough.get(cid);
                    if (raw.type === 'message.new' && approval && raw.message?.id && raw.message.id !== approval.id) {
                        readControl.approvedThrough.delete(cid);
                        emitReadEvent('READ_AUTHORIZATION_REVOKED', { conversationId: safeIdentifier(cid), reason: 'different-message-new-event' });
                    }
                    const messages = Array.isArray(raw.messages) ? raw.messages : raw.message ? [raw.message] : [];
                    messages.slice(-MAX_MESSAGES).forEach((m) => rememberMessage(cid, m, true));
                    const reads = Array.isArray(raw.read) ? raw.read : raw.read && typeof raw.read === 'object' ? Object.values(raw.read) : [];
                    reads.forEach((r) => rememberRead(cid, r, 'http-state', null, requestStartedAt));
                    if (source === 'websocket' && /^(message\.read|notification\.mark_read)$/.test(raw.type || '')) {
                        if (raw.type === 'notification.mark_read' && raw.user?.id) setSelfId(raw.user.id);
                        rememberRead(cid, {
                            user: raw.user, user_id: raw.user_id,
                            last_read: raw.last_read || raw.created_at,
                            last_read_message_id: raw.last_read_message_id
                        }, 'websocket-read', raw.created_at);
                        push('plugin', 'message-state', raw.user?.id === messageState.selfId
                            ? 'SERVER_READ_CONFIRMED' : messageState.selfId ? 'COUNTERPART_READ_RECEIVED' : 'READ_RECEIVED_IDENTITY_UNKNOWN', {
                            conversationId: safeIdentifier(cid), userId: safeIdentifier(raw.user?.id),
                            lastReadMessageId: safeIdentifier(raw.last_read_message_id), lastRead: safeTime(raw.last_read || raw.created_at)
                        });
                    }
                    if (/^(notification\.mark_unread|message\.deleted|channel\.truncated)$/.test(raw.type || '')) {
                        readControl.approvedThrough.delete(cid);
                        const state = channelRecord(cid);
                        if (raw.type === 'notification.mark_unread') {
                            const uid = raw.user?.id || messageState.selfId;
                            state.reads.delete(uid);
                            rememberRead(cid, { user_id: uid, last_read: raw.last_read, last_read_message_id: raw.last_read_message_id }, 'websocket-unread', raw.created_at);
                        }
                    }
                }
                if (raw.event && typeof raw.event === 'object') observeServerData(raw.event, cid, 'websocket', requestStartedAt);
                scheduleMessageRender();
            };
            const compareRead = (state, message, cursor) => {
                if (!cursor || !message?.createdAt || !message.serverConfirmed || message.parentId) return 'unknown';
                if (cursor.lastMessageId === message.id) return 'read';
                const at = timeValue(message.createdAt);
                if (cursor.lastMessageId) {
                    const boundary = state.messages.get(cursor.lastMessageId);
                    if (boundary?.serverConfirmed && boundary.createdAt) {
                        const edge = timeValue(boundary.createdAt);
                        return at < edge ? 'read' : at > edge ? 'unread' : 'unknown';
                    }
                    // Without the boundary message we cannot reconstruct equal-time ordering.
                    if (cursor.lastRead && at > timeValue(cursor.lastRead)) return 'unread';
                    return 'unknown';
                }
                return cursor.lastRead ? at <= timeValue(cursor.lastRead) ? 'read' : 'unread' : 'unknown';
            };
            const messageReadingState = (state, m) => {
                if (!messageState.selfId || !m.senderId) return { direction: 'unknown', status: 'unknown' };
                const own = m.senderId === messageState.selfId;
                if (!own) return { direction: 'incoming', status: compareRead(state, m, state.reads.get(messageState.selfId)) };
                const others = [...state.reads.values()].filter((r) => r.userId !== messageState.selfId);
                const statuses = others.map((r) => compareRead(state, m, r));
                // In a group, [seen] means at least one other reader, never "everyone".
                return { direction: 'outgoing', status: statuses.includes('read') ? 'read'
                    : statuses.length && statuses.every((v) => v === 'unread') ? 'unread' : 'unknown' };
            };
            const reactProps = (element, wanted) => {
                for (const key of Reflect.ownKeys(element || {})) {
                    if (!/^__react(?:Props|Fiber)\$/.test(String(key))) continue;
                    let value;
                    try { value = element[key]; } catch { continue; }
                    if (value?.[wanted]) return value[wanted];
                    for (let depth = 0, fiber = value; fiber && depth < 22; depth++, fiber = fiber.return) {
                        const candidate = fiber.memoizedProps?.[wanted] || fiber.pendingProps?.[wanted];
                        if (candidate) return candidate;
                    }
                }
                return null;
            };
            const observeNativeMarkRead = (channel) => {
                if (!diagnostic.active || readControl.channelHooks.has(channel)) return;
                const descriptor = Object.getOwnPropertyDescriptor(channel, 'markRead');
                const original = channel.markRead;
                const wrapper = function observedMarkRead() {
                    const labels = String(new Error().stack || '').split('\n').slice(2, 10)
                        .map((line) => line.match(/^\s*at\s+([A-Za-z0-9_.$<>]+)/)?.[1])
                        .filter((name) => name && name !== 'http' && name !== 'https');
                    emitReadEvent('NATIVE_MARK_READ_CALL', {
                        conversationId: safeIdentifier(channelCID(this)),
                        origin: readControl.invocationSource || 'native-unclassified',
                        callsiteFunctions: labels
                    });
                    return original.apply(this, arguments);
                };
                try {
                    channel.markRead = wrapper;
                    if (channel.markRead === wrapper) readControl.channelHooks.set(channel, { descriptor, wrapper });
                } catch { /* Frozen SDK objects still work via HTTP observation. */ }
            };
            const findActiveStreamChannel = () => {
                const roots = [...document.querySelectorAll('.str-chat__channel, .channelContainer, [class*="ChatModal"]')];
                for (const root of roots) {
                    if (!root.getClientRects().length) continue;
                    for (const element of [root, ...[...root.querySelectorAll('*')].slice(0, 450)]) {
                        const channel = reactProps(element, 'channel');
                        if (!channel || typeof channel.markRead !== 'function') continue;
                        try { setSelfId(channel.getClient?.().userID); } catch { /* No identity inferred from DOM text. */ }
                        observeNativeMarkRead(channel);
                        return channel;
                    }
                }
                return null;
            };
            const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
            const applyMessageUI = (element, state, m) => {
                const bubble = element.querySelector('.str-chat__message-bubble');
                if (!bubble) return;
                const reading = messageReadingState(state, m);
                const red = reading.direction === 'incoming' && reading.status === 'unread' && readControl.enabled;
                const green = reading.status === 'read';
                const pending = red && readControl.confirmations.has(state.cid);
                const signature = JSON.stringify([state.cid, m.id, m.createdAt, reading.direction, reading.status, readControl.enabled, pending]);
                if (element.dataset.vgtStateSignature === signature && element.querySelector('.vgt-state-meta')
                    && Boolean(bubble.querySelector('.vgt-state-marker')) === (red || green)) return;
                element.dataset.vgtStateSignature = signature;
                element.dataset.vgtStateManaged = 'true';
                let row = element.querySelector('.vgt-state-meta');
                if (!row) {
                    row = document.createElement('div'); row.className = 'vgt-state-meta notranslate'; row.translate = false;
                    row.dataset.vgtUi = 'message-state';
                    const seen = document.createElement('span'); seen.className = 'vgt-state-seen';
                    const time = document.createElement('time'); time.className = 'vgt-state-time';
                    row.append(seen, time);
                    (bubble.closest('.str-chat__message-bubble-group') || bubble.parentElement).append(row);
                }
                setText(row.querySelector('.vgt-state-seen'), green ? '[seen]' : '');
                const time = row.querySelector('time');
                if (m.createdAt) {
                    const date = new Date(m.createdAt);
                    time.dateTime = m.createdAt; time.title = date.toLocaleString();
                    setText(time, date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
                } else { time.removeAttribute('datetime'); setText(time, ''); }
                let marker = bubble.querySelector(':scope > .vgt-state-marker');
                if (red || green) {
                    if (!marker) {
                        marker = document.createElement('button'); marker.type = 'button'; marker.className = 'vgt-state-marker notranslate';
                        marker.dataset.vgtUi = 'message-state'; marker.translate = false;
                        // Keep native bubble/select/reaction handlers out of a status-button click.
                        ['pointerdown', 'mousedown', 'touchstart'].forEach((type) => marker.addEventListener(type, (event) => event.stopPropagation()));
                        marker.addEventListener('click', (event) => {
                            event.preventDefault(); event.stopPropagation();
                            const cid = marker.__vgtCID, messageId = marker.__vgtMessageId;
                            if (marker.dataset.status !== 'unread' || !readControl.enabled || readControl.confirmations.has(cid)) return;
                            emitReadEvent('MANUAL_READ_CLICK', { conversationId: safeIdentifier(cid), messageId: safeIdentifier(messageId) });
                            // The channel guard is synchronous; every red dot is disabled until confirmation.
                            void manuallyReleaseRead(cid).catch((error) => {
                                push('plugin', 'error', 'MANUAL_READ_RELEASE_FAILED', { errorName: error?.name || 'Error' });
                            });
                            renderMessageState();
                        });
                        bubble.append(marker);
                    }
                    bubble.classList.add('vgt-read-bubble');
                    marker.__vgtCID = state.cid; marker.__vgtMessageId = m.id;
                    marker.dataset.direction = reading.direction;
                    marker.dataset.status = pending ? 'pending' : red ? 'unread' : 'read';
                    marker.title = pending ? '正在等待已读确认' : red ? '未读 · 点击标记为已读'
                        : reading.direction === 'incoming' ? '我已读' : '对方已读';
                    marker.setAttribute('aria-label', marker.title);
                    marker.setAttribute('aria-busy', String(pending));
                    marker.disabled = !red || pending;
                    setText(marker, red ? '●' : '✓');
                } else marker?.remove();
                const uiKey = state.cid + '/' + m.id;
                const eventSignature = JSON.stringify([reading.direction, reading.status, Boolean(m.createdAt), red, pending]);
                if (diagnostic.active && messageState.uiSignatures.get(uiKey) !== eventSignature) {
                    messageState.uiSignatures.set(uiKey, eventSignature);
                    if (messageState.uiSignatures.size > 3000) messageState.uiSignatures.delete(messageState.uiSignatures.keys().next().value);
                    push('plugin', 'message-state', 'MESSAGE_READ_UI_STATE_CHANGED', {
                        conversationId: safeIdentifier(state.cid), ...publicMessage(m), ...reading,
                        redDot: red, pending, greenCheck: green, seen: green, timestampVisible: Boolean(m.createdAt)
                    });
                }
            };
            const renderMessageState = () => {
                messageState.renderTimer = 0;
                const channel = findActiveStreamChannel();
                const cid = channelCID(channel);
                if (!cid) return;
                const state = channelRecord(cid);
                // Client messages supply identity/timestamps, never authoritative read cursors.
                const localReadSummary = Object.values(channel.state?.read || {}).slice(0, 100).map((r) => ({
                    userId: safeIdentifier(r.user?.id), lastRead: safeTime(r.last_read),
                    lastReadMessageId: safeIdentifier(r.last_read_message_id), unreadMessages: pickCount(r.unread_messages)
                }));
                const localSignature = JSON.stringify(localReadSummary);
                if (diagnostic.active && state.localSignature !== localSignature) {
                    state.localSignature = localSignature;
                    push('plugin', 'message-state', 'CLIENT_READ_STATE_OBSERVED', {
                        conversationId: safeIdentifier(cid), read: localReadSummary, authoritativeForUI: false
                    });
                }
                const clientMessages = channel.state?.messages || [];
                for (const element of [...document.querySelectorAll('.str-chat__message')].slice(0, 500)) {
                    let raw = reactProps(element, 'message');
                    if (!raw?.id) {
                        const id = element.getAttribute('data-message-id') || element.id;
                        raw = clientMessages.find((m) => m.id === id);
                    }
                    if (!raw?.id) {
                        for (const child of [...element.querySelectorAll('*')].slice(0, 35)) {
                            raw = reactProps(child, 'message'); if (raw?.id) break;
                        }
                    }
                    if (!raw?.id || (raw.cid && raw.cid !== cid)) continue;
                    const existing = state.messages.get(raw.id);
                    const m = existing || rememberMessage(cid, raw, false);
                    if (m) applyMessageUI(element, state, m);
                }
            };
            function scheduleMessageRender() {
                if (messageState.renderTimer) return;
                messageState.renderTimer = window.setTimeout(() => {
                    try { renderMessageState(); } catch (error) {
                        messageState.renderTimer = 0;
                        push('plugin', 'error', 'MESSAGE_STATE_RENDER_ERROR', { errorName: error?.name || 'Error' });
                    }
                }, 100);
            }
            const stateEvidenceSnapshot = () => {
                findActiveStreamChannel();
                messageState.channels.forEach((state) => {
                    state.localSignature = null;
                    push('plugin', 'message-state', 'SERVER_STATE_BASELINE', {
                        conversationId: safeIdentifier(state.cid), selfId: safeIdentifier(messageState.selfId),
                        messageCount: state.messages.size,
                        read: [...state.reads.values()].map((r) => ({ userId: safeIdentifier(r.userId),
                            lastRead: r.lastRead, lastReadMessageId: safeIdentifier(r.lastMessageId), evidence: r.source }))
                    });
                });
                messageState.uiSignatures.clear();
                document.querySelectorAll('[data-vgt-state-signature]').forEach((el) => delete el.dataset.vgtStateSignature);
                scheduleMessageRender();
            };

            // Read control is a normal setting. Monitoring only records these transitions.
            // Approvals are bounded by a confirmed message, never by an elapsed-time window.
            const readIsAllowed = (cid, body) => {
                if (!readControl.enabled) return { reason: 'native' };
                const requestedId = observedJSON(body)?.message_id;
                const latest = messageState.channels.get(cid)?.latest;
                const permit = readControl.manualPermits.get(cid);
                if (permit && latest?.id === permit.targetId && (!requestedId || requestedId === permit.targetId)) {
                    readControl.manualPermits.delete(cid);
                    return { reason: permit.reason, actionId: permit.actionId };
                }
                const approved = readControl.approvedThrough.get(cid);
                if (approved && latest?.id === approved.id && (!requestedId || requestedId === approved.id)) {
                    return { reason: 'confirmed-reply-boundary', messageId: safeIdentifier(approved.id), actionId: approved.actionId };
                }
                return null;
            };
            const removePending = (cid, entry) => {
                const entries = (readControl.pendingReads.get(cid) || []).filter((item) => item !== entry);
                if (entries.length) readControl.pendingReads.set(cid, entries); else readControl.pendingReads.delete(cid);
            };
            const addPendingRead = (cid, entry) => {
                const entries = readControl.pendingReads.get(cid) || [];
                if (entries.length >= 4) entries.shift()?.cancel('superseded');
                entries.push(entry); readControl.pendingReads.set(cid, entries);
                emitReadEvent('READ_ATTEMPT_BLOCKED', {
                    conversationId: safeIdentifier(cid), requestId: entry.requestId, transport: entry.transport,
                    pendingForChannel: entries.length, relatedActionId: readControl.reactions.get(cid)?.actionId
                });
            };
            const releasePendingReads = (cid, reason) => {
                const entries = readControl.pendingReads.get(cid) || [];
                readControl.pendingReads.delete(cid);
                entries.forEach((entry) => {
                    try { entry.release(reason); } catch (error) {
                        entry.cancel('release-failed');
                        push('plugin', 'error', 'READ_PENDING_RELEASE_ERROR', { errorName: error?.name || 'Error', requestId: entry.requestId });
                    }
                });
                emitReadEvent('READ_PENDING_RELEASED', { conversationId: safeIdentifier(cid), reason, count: entries.length });
                return entries.length;
            };
            const detachReadCallObservers = () => {
                readControl.channelHooks.forEach(({ descriptor, wrapper }, channel) => {
                    if (channel.markRead !== wrapper) return;
                    if (descriptor) Object.defineProperty(channel, 'markRead', descriptor);
                    else delete channel.markRead;
                });
                readControl.channelHooks.clear(); readControl.invocationSource = null;
            };
            const endConfirmation = (cid, reason, expected) => {
                const pending = readControl.confirmations.get(cid);
                if (!pending || (expected && pending !== expected)) return;
                window.clearTimeout(pending.timer);
                readControl.confirmations.delete(cid);
                readControl.manualPermits.delete(cid);
                if (reason !== 'server-cursor') readControl.approvedThrough.delete(cid);
                push('plugin', reason === 'server-cursor' ? 'message-state' : 'error',
                    reason === 'server-cursor' ? 'READ_PENDING_CONFIRMED' : 'READ_CONFIRMATION_FAILED', {
                        conversationId: safeIdentifier(cid), actionId: pending.actionId, reason
                    });
                scheduleMessageRender();
            };
            const confirmReadCursor = (cid) => {
                const pending = readControl.confirmations.get(cid);
                const state = messageState.channels.get(cid);
                const target = state?.messages.get(pending?.targetId);
                const cursor = state?.reads.get(messageState.selfId);
                if (pending && target && cursor && compareRead(state, target, cursor) === 'read') {
                    endConfirmation(cid, 'server-cursor', pending);
                }
            };
            const beginConfirmation = (cid, target, reason, actionId) => {
                if (readControl.confirmations.has(cid)) return null;
                const pending = { targetId: target.id, reason, actionId, timer: 0 };
                // This timer only recovers the UI from a missing confirmation; it never permits reads.
                pending.timer = window.setTimeout(() => endConfirmation(cid, 'confirmation-timeout', pending), 25000);
                readControl.confirmations.set(cid, pending);
                emitReadEvent('READ_CONFIRMATION_PENDING', {
                    conversationId: safeIdentifier(cid), messageId: safeIdentifier(target.id), reason, actionId
                });
                scheduleMessageRender(); return pending;
            };
            const stopReadRuntime = (reason = 'setting-disabled') => {
                readControl.enabled = false; readControl.generation += 1;
                readControl.manualPermits.clear(); readControl.approvedThrough.clear(); readControl.reactions.clear();
                readControl.confirmations.forEach((pending) => window.clearTimeout(pending.timer));
                readControl.confirmations.clear();
                const all = [...readControl.pendingReads.values()].flat(); readControl.pendingReads.clear();
                // Never silently flush unapproved receipts when a setting is disabled.
                all.forEach((entry) => entry.cancel(reason));
                emitReadEvent('READ_CONTROL_DISABLED', { pendingCancelled: all.length, futureRequests: 'native', reason });
                scheduleMessageRender();
            };
            const submitNativeRead = async (cid, reason, actionId, expectedTargetId) => {
                if (readControl.confirmations.has(cid)) return { released: 0, reason: 'confirmation-pending' };
                const channel = findActiveStreamChannel();
                const target = messageState.channels.get(cid)?.latest;
                if (!channel || channelCID(channel) !== cid || !target?.id || (expectedTargetId && target.id !== expectedTargetId)) {
                    return { released: 0, reason: 'active-channel-or-boundary-unavailable' };
                }
                const pending = beginConfirmation(cid, target, reason, actionId);
                if (!pending) return { released: 0, reason: 'confirmation-pending' };
                emitReadEvent(reason === 'manual-click' ? 'MANUAL_READ_RELEASE' : 'REACTION_READ_RELEASE', {
                    conversationId: safeIdentifier(cid), actionId, hadPendingRequest: readControl.pendingReads.has(cid)
                });
                try {
                    if (readControl.pendingReads.has(cid)) return { released: releasePendingReads(cid, reason) };
                    readControl.manualPermits.set(cid, { targetId: target.id, reason, actionId });
                    let operation;
                    readControl.invocationSource = reason;
                    try { operation = channel.markRead({ message_id: target.id }); }
                    finally { readControl.invocationSource = null; }
                    const result = await operation;
                    if (result) observeServerData(result, cid, 'http-state');
                    if (result === null) endConfirmation(cid, 'native-read-unavailable', pending);
                    return { released: 0, triggeredNativeMarkRead: true };
                } catch (error) {
                    endConfirmation(cid, 'native-read-failed', pending); throw error;
                } finally {
                    if (readControl.manualPermits.get(cid)?.actionId === actionId) readControl.manualPermits.delete(cid);
                }
            };
            const manuallyReleaseRead = async (expectedCID) => {
                if (!readControl.enabled) return { released: 0, reason: 'read-control-disabled' };
                const cid = expectedCID || channelCID(findActiveStreamChannel());
                if (!cid) return { released: 0, reason: 'no-active-channel' };
                return submitNativeRead(cid, 'manual-click', 'manual-' + (++requestSequence));
            };
            const actionStarted = (request) => {
                if (!request.messageRequest && !request.reactionRequest) return;
                request.actionId = request.requestId;
                request.reactionReadEnabledAtAttempt = readControl.reactionMarkRead;
                request.sentMessageId = request.messageRequest ? observedJSON(request.body)?.message?.id : null;
                request.boundaryAtAttempt = messageState.channels.get(request.cid)?.latest?.id;
                request.boundaryRevision = messageState.channels.get(request.cid)?.revision;
                if (request.reactionRequest && request.cid) {
                    readControl.reactions.set(request.cid, { actionId: request.actionId });
                    if (readControl.reactions.size > MAX_CHANNELS) readControl.reactions.delete(readControl.reactions.keys().next().value);
                }
                push('user', request.messageRequest ? 'message' : 'reaction', request.messageRequest ? 'MESSAGE_SEND_ATTEMPT' : 'REACTION_ATTEMPT', {
                    requestId: request.requestId, actionId: request.actionId, conversationId: safeIdentifier(request.cid),
                    messageId: safeIdentifier(request.sentMessageId || request.reactionMessageId), method: request.method
                });
            };
            const actionFinished = (request, ok, raw) => {
                if (!request.messageRequest && !request.reactionRequest) return;
                const kind = request.messageRequest ? 'MESSAGE_SEND' : 'REACTION';
                if (sameRun(request)) push('user', request.messageRequest ? 'message' : 'reaction', kind + (ok ? '_CONFIRMED' : '_FAILED'), {
                    actionId: request.actionId, requestId: request.requestId, conversationId: safeIdentifier(request.cid), status: request.status,
                    method: request.method, messageId: safeIdentifier(raw?.message?.id || request.sentMessageId || request.reactionMessageId)
                });
                if (!ok || request.generation !== readControl.generation) return;
                if (request.reactionRequest) {
                    if (request.method !== 'POST' || !readControl.reactionMarkRead || !request.reactionReadEnabledAtAttempt || !request.boundaryAtAttempt) return;
                    const latest = messageState.channels.get(request.cid)?.latest;
                    if (latest?.id !== request.boundaryAtAttempt || messageState.channels.get(request.cid)?.revision !== request.boundaryRevision) {
                        emitReadEvent('REACTION_READ_SKIPPED', { actionId: request.actionId, reason: 'newer-message-after-attempt' }); return;
                    }
                    void submitNativeRead(request.cid, 'confirmed-reaction', request.actionId, request.boundaryAtAttempt).catch((error) => {
                        push('plugin', 'error', 'REACTION_READ_FAILED', { actionId: request.actionId, errorName: error?.name || 'Error' });
                    });
                    return;
                }
                if (!readControl.enabled) return;
                const state = messageState.channels.get(request.cid);
                const sent = state?.messages.get(raw?.message?.id || request.sentMessageId);
                const ambiguousBoundary = sent && [...state.messages.values()].some((m) =>
                    m.id !== sent.id && m.serverConfirmed && !m.parentId && m.createdAt
                    && timeValue(m.createdAt) >= timeValue(sent.createdAt));
                if (sent?.serverConfirmed && !sent.parentId && !ambiguousBoundary && sent.senderId === messageState.selfId && state.latest?.id === sent.id) {
                    readControl.approvedThrough.set(request.cid, { id: sent.id, createdAt: sent.createdAt, actionId: request.actionId });
                    emitReadEvent('READ_REPLY_BOUNDARY_AUTHORIZED', {
                        conversationId: safeIdentifier(request.cid), messageId: safeIdentifier(sent.id), actionId: request.actionId,
                        basis: 'successful-http-send-and-server-message-boundary'
                    });
                    if (!readControl.confirmations.has(request.cid)) beginConfirmation(request.cid, sent, 'confirmed-reply', request.actionId);
                    releasePendingReads(request.cid, 'confirmed-reply-boundary');
                    confirmReadCursor(request.cid);
                } else emitReadEvent('READ_REPLY_AUTHORIZATION_UNAVAILABLE', {
                    conversationId: safeIdentifier(request.cid), actionId: request.actionId, reason: 'missing-or-newer-message-boundary'
                });
            };

            const newRequest = (method, rawURL, body, transport) => {
                const endpoint = safeURL(rawURL);
                const request = {
                    requestId: transport + '-' + (++requestSequence), method: String(method || 'GET').toUpperCase(),
                    rawURL: String(rawURL || ''), body, transport, started: performance.now(), epoch: Date.now(),
                    cid: channelKeyFromURL(rawURL), session: diagnostic.active ? diagnostic.startedAt : null,
                    endpoint, generation: readControl.generation, finished: false, dispatchedAt: null
                };
                request.readRequest = isReadRequest(request.method, rawURL);
                request.messageRequest = isMessageSendRequest(request.method, rawURL);
                request.reactionRequest = false;
                try {
                    const parsed = new URL(rawURL, location.href);
                    if (endpoint.scope === 'stream') {
                        setSelfId(parsed.searchParams.get('user_id'));
                        const reaction = parsed.pathname.match(/\/messages\/([^/]+)\/reaction(?:\/[^/]+)?$/);
                        if (reaction && /^(POST|DELETE)$/.test(request.method)) {
                            request.reactionRequest = true;
                            request.reactionMessageId = decodeURIComponent(reaction[1]);
                            const state = [...messageState.channels.values()].find((s) => s.messages.has(request.reactionMessageId));
                            request.cid = state?.cid || channelCID(findActiveStreamChannel());
                        }
                        request.inspectState = /^\/channels(?:\/|$)/.test(parsed.pathname) || Boolean(reaction);
                    }
                } catch { /* Invalid URL is left to the native transport. */ }
                if (diagnostic.active) {
                    push('network', 'request', 'http.request', {
                        requestId: request.requestId, transport, method: request.method, ...endpoint,
                        body: summarisePayload(body), readRequest: request.readRequest, messageRequest: request.messageRequest,
                        reactionRequest: request.reactionRequest, conversationId: safeIdentifier(request.cid), phase: 'attempt'
                    });
                }
                actionStarted(request);
                return request;
            };
            const sameRun = (r) => r.session && diagnostic.active && r.session === diagnostic.startedAt;
            const dispatched = (r, reason) => {
                r.dispatchedAt = performance.now();
                if (r.readRequest) r.confirmation = readControl.confirmations.get(r.cid);
                if (sameRun(r)) push('network', 'request', 'http.dispatched', {
                    requestId: r.requestId, delayedMs: Math.round(r.dispatchedAt - r.started), reason
                });
            };
            const finishRequest = (r, status, raw, errorName) => {
                if (r.finished) return;
                r.finished = true; r.status = Number(status || 0);
                const ok = !errorName && r.status >= 200 && r.status < 300;
                if (ok && r.inspectState && raw) {
                    try { observeServerData(raw, r.cid, 'http-state', r.epoch); }
                    catch (error) { push('plugin', 'error', 'SERVER_STATE_PARSE_ERROR', { errorName: error?.name || 'Error' }); }
                }
                if (sameRun(r)) {
                    push('network', errorName === 'AbortError' ? 'cancel' : errorName || !ok ? 'error' : 'response',
                        errorName === 'AbortError' ? 'http.cancelled' : errorName ? 'http.error' : 'http.response', {
                        requestId: r.requestId, status: r.status, ok, errorName,
                        durationMs: Math.round(performance.now() - r.started),
                        wireDurationMs: r.dispatchedAt === null ? null : Math.round(performance.now() - r.dispatchedAt)
                    });
                    if (r.readRequest && ok) push('plugin', 'message-state', 'READ_HTTP_CONFIRMED', {
                        requestId: r.requestId, conversationId: safeIdentifier(r.cid),
                        cursorEvidencePresent: Boolean(raw?.event?.last_read_message_id || raw?.event?.created_at || raw?.read),
                        // HTTP success alone without a cursor does not paint all messages green.
                        evidence: 'http-status'
                    });
                }
                actionFinished(r, ok, raw);
                if (r.readRequest && r.confirmation && !ok) endConfirmation(r.cid, errorName || 'http-failed', r.confirmation);
                r.body = undefined;
            };
            const boundedResponseJSON = async (response) => {
                try {
                    const size = Number(response.headers?.get('content-length') || 0);
                    if (size > 2000000) return null;
                    const copy = response.clone();
                    if (!copy.body?.getReader) return null;
                    const reader = copy.body.getReader();
                    const decoder = new TextDecoder();
                    let length = 0, text = '';
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        length += value.byteLength;
                        if (length > 2000000) { void reader.cancel(); return null; }
                        text += decoder.decode(value, { stream: true });
                    }
                    text += decoder.decode();
                    return observedJSON(text);
                } catch { return null; }
            };
            const nativeFetch = window.fetch;
            if (typeof nativeFetch === 'function') {
                window.fetch = function observedFetch(input, init) {
                    const context = this, args = arguments;
                    const rawURL = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
                    const r = newRequest(init?.method || input?.method || 'GET', rawURL, init?.body, 'fetch');
                    const signal = init?.signal || input?.signal;
                    const perform = (reason = 'native') => {
                        dispatched(r, reason);
                        let result;
                        try { result = nativeFetch.apply(context, args); }
                        catch (error) { finishRequest(r, 0, null, error?.name || 'Error'); throw error; }
                        Promise.resolve(result).then(async (response) => {
                            const raw = r.inspectState && response.ok ? await boundedResponseJSON(response) : null;
                            finishRequest(r, response.status, raw);
                        }, (error) => finishRequest(r, 0, null, error?.name || 'Error'));
                        return result;
                    };
                    if (r.readRequest && readControl.enabled) {
                        emitReadEvent('READ_ATTEMPT_DETECTED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), transport: 'fetch' });
                        const allowed = readIsAllowed(r.cid, r.body);
                        if (!allowed) return new Promise((resolve, reject) => {
                            let done = false;
                            const detach = () => { removePending(r.cid, entry); signal?.removeEventListener('abort', abort); };
                            const entry = {
                                requestId: r.requestId, transport: 'fetch',
                                cancel: (reason) => {
                                    if (done) return; done = true; detach();
                                    emitReadEvent('READ_PENDING_CANCELLED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), reason });
                                    finishRequest(r, 0, null, 'AbortError'); reject(new DOMException('Read request cancelled', 'AbortError'));
                                },
                                release: (reason) => {
                                    if (done) return; done = true; detach();
                                    emitReadEvent('READ_ATTEMPT_ALLOWED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), reason });
                                    try { Promise.resolve(perform(reason)).then(resolve, reject); } catch (error) { reject(error); }
                                }
                            };
                            const abort = () => entry.cancel('caller-abort');
                            addPendingRead(r.cid, entry);
                            if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
                        });
                        emitReadEvent('READ_ATTEMPT_ALLOWED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), ...allowed });
                        return perform(allowed.reason);
                    }
                    return perform();
                };
                Object.setPrototypeOf(window.fetch, nativeFetch);
            }
            const xhrMeta = new WeakMap();
            const nativeOpen = XMLHttpRequest.prototype.open;
            const nativeSend = XMLHttpRequest.prototype.send;
            const nativeAbort = XMLHttpRequest.prototype.abort;
            XMLHttpRequest.prototype.open = function observedOpen(method, url) {
                xhrMeta.get(this)?.pending?.cancel('xhr-reopened');
                xhrMeta.set(this, { method, url });
                return nativeOpen.apply(this, arguments);
            };
            XMLHttpRequest.prototype.abort = function observedAbort() {
                const pending = xhrMeta.get(this)?.pending;
                if (pending) return pending.cancel('caller-abort');
                return nativeAbort.apply(this, arguments);
            };
            XMLHttpRequest.prototype.send = function observedSend(body) {
                const xhr = this, meta = xhrMeta.get(xhr) || {};
                const r = newRequest(meta.method || 'GET', meta.url || '', body, 'xhr');
                const readBody = () => {
                    if (!r.inspectState) return null;
                    try {
                        if (xhr.responseType === 'json') return xhr.response;
                        if (!xhr.responseType || xhr.responseType === 'text') return observedJSON(xhr.responseText);
                    } catch { /* Response body is not textual. */ }
                    return null;
                };
                const cleanup = () => {
                    xhr.removeEventListener('load', onLoad); xhr.removeEventListener('error', onError);
                    xhr.removeEventListener('timeout', onTimeout); xhr.removeEventListener('abort', onAbort);
                };
                const finish = (error) => { finishRequest(r, xhr.status, error ? null : readBody(), error); cleanup(); };
                const onLoad = () => finish();
                const onError = () => finish('NetworkError');
                const onTimeout = () => finish('TimeoutError');
                const onAbort = () => finish('AbortError');
                xhr.addEventListener('load', onLoad); xhr.addEventListener('error', onError);
                xhr.addEventListener('timeout', onTimeout); xhr.addEventListener('abort', onAbort);
                const perform = (reason = 'native') => {
                    meta.pending = null; dispatched(r, reason);
                    try { return nativeSend.call(xhr, body); }
                    catch (error) { finishRequest(r, 0, null, error?.name || 'Error'); cleanup(); throw error; }
                };
                if (r.readRequest && readControl.enabled) {
                    emitReadEvent('READ_ATTEMPT_DETECTED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), transport: 'xhr' });
                    const allowed = readIsAllowed(r.cid, body);
                    if (!allowed) {
                        let done = false;
                        const entry = {
                            requestId: r.requestId, transport: 'xhr',
                            cancel: (reason) => {
                                if (done) return; done = true; removePending(r.cid, entry); meta.pending = null;
                                emitReadEvent('READ_PENDING_CANCELLED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), reason });
                                // An XHR whose native send never ran does not emit abort by itself.
                                let abortObserved = false;
                                const markAbort = () => { abortObserved = true; };
                                xhr.addEventListener('abort', markAbort);
                                nativeAbort.call(xhr);
                                xhr.removeEventListener('abort', markAbort);
                                if (!abortObserved) {
                                    xhr.dispatchEvent(new ProgressEvent('abort'));
                                    xhr.dispatchEvent(new ProgressEvent('loadend'));
                                }
                                finishRequest(r, 0, null, 'AbortError'); cleanup();
                            },
                            release: (reason) => {
                                if (done) return; done = true; removePending(r.cid, entry);
                                emitReadEvent('READ_ATTEMPT_ALLOWED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), reason });
                                perform(reason);
                            }
                        };
                        meta.pending = entry; addPendingRead(r.cid, entry); return undefined;
                    }
                    emitReadEvent('READ_ATTEMPT_ALLOWED', { requestId: r.requestId, conversationId: safeIdentifier(r.cid), ...allowed });
                    return perform(allowed.reason);
                }
                return perform();
            };

            const NativeWebSocket = window.WebSocket;
            if (typeof NativeWebSocket === 'function') {
                const ObservedWebSocket = function ObservedWebSocket(url, protocols) {
                    const socket = protocols === undefined
                        ? new NativeWebSocket(url)
                        : new NativeWebSocket(url, protocols);
                    const endpoint = safeURL(url);
                    socket.addEventListener('open', () => push('websocket', 'connection', 'websocket.connect', endpoint));
                    socket.addEventListener('close', (event) => push('websocket', 'connection', 'websocket.disconnect', {
                        ...endpoint,
                        code: event.code,
                        wasClean: event.wasClean
                    }));
                    socket.addEventListener('error', () => push('websocket', 'error', 'websocket.error', endpoint));
                    socket.addEventListener('message', (event) => {
                        const raw = observedJSON(event.data);
                        if (endpoint.scope === 'stream' && raw) {
                            try { observeServerData(raw, null, 'websocket'); }
                            catch (error) { push('plugin', 'error', 'SERVER_STATE_PARSE_ERROR', { errorName: error?.name || 'Error' }); }
                        }
                        const payload = summarisePayload(event.data);
                        if (payload?.type === 'health.check') return;
                        push('websocket', 'event', payload?.type || 'websocket.receive', {
                            direction: 'receive',
                            ...endpoint,
                            payload
                        });
                    });
                    const socketSend = socket.send;
                    socket.send = function observedWebSocketSend(data) {
                        const payload = summarisePayload(data);
                        if (payload?.type !== 'health.check') {
                            push('websocket', 'event', payload?.type || 'websocket.send', {
                                direction: 'send',
                                ...endpoint,
                                payload
                            });
                        }
                        return socketSend.apply(this, arguments);
                    };
                    return socket;
                };
                ObservedWebSocket.prototype = NativeWebSocket.prototype;
                Object.setPrototypeOf(ObservedWebSocket, NativeWebSocket);
                ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((key) => {
                    Object.defineProperty(ObservedWebSocket, key, { value: NativeWebSocket[key] });
                });
                window.WebSocket = ObservedWebSocket;
            }

            const NativeEventSource = window.EventSource;
            if (typeof NativeEventSource === 'function') {
                const ObservedEventSource = function ObservedEventSource(url, options) {
                    const source = new NativeEventSource(url, options);
                    const endpoint = safeURL(url);
                    source.addEventListener('open', () => push('sse', 'connection', 'sse.connect', endpoint));
                    source.addEventListener('error', () => push('sse', 'error', 'sse.error', endpoint));
                    source.addEventListener('message', (event) => {
                        const payload = summarisePayload(event.data);
                        push('sse', 'event', payload?.type || 'sse.message', {
                            ...endpoint,
                            payload
                        });
                    });
                    return source;
                };
                ObservedEventSource.prototype = NativeEventSource.prototype;
                Object.setPrototypeOf(ObservedEventSource, NativeEventSource);
                window.EventSource = ObservedEventSource;
            }

            const emitRouteChange = (trigger, from) => {
                const to = routeSnapshot();
                if (from.pathname === to.pathname && from.pageType === to.pageType) return;
                push('page', 'navigation', 'ROUTE_CHANGE', { trigger, from, to });
            };

            ['pushState', 'replaceState'].forEach((method) => {
                const nativeMethod = history[method];
                history[method] = function observedHistoryChange() {
                    const from = routeSnapshot();
                    const result = nativeMethod.apply(this, arguments);
                    emitRouteChange(method, from);
                    return result;
                };
            });
            window.addEventListener('popstate', () => {
                const current = routeSnapshot();
                push('page', 'navigation', 'ROUTE_CHANGE', {
                    trigger: 'popstate',
                    from: null,
                    to: current
                });
            });
            window.addEventListener('hashchange', () => {
                const current = routeSnapshot();
                push('page', 'navigation', 'ROUTE_CHANGE', {
                    trigger: 'hashchange',
                    from: null,
                    to: current
                });
            });
            document.addEventListener('visibilitychange', () => push(
                'page',
                'visibility',
                document.hidden ? 'PAGE_HIDDEN' : 'PAGE_VISIBLE',
                { visibility: document.visibilityState, hasFocus: document.hasFocus() }
            ));
            window.addEventListener('focus', () => push('page', 'focus', 'WINDOW_FOCUS', {
                visibility: document.visibilityState
            }));
            window.addEventListener('blur', () => push('page', 'focus', 'WINDOW_BLUR', {
                visibility: document.visibilityState
            }));
            window.addEventListener('error', (event) => push('page', 'error', 'WINDOW_ERROR', {
                errorName: event.error?.name || 'Error',
                scriptOrigin: event.filename ? safeURL(event.filename).endpoint : undefined
            }));
            window.addEventListener('unhandledrejection', (event) => push(
                'page',
                'error',
                'UNHANDLED_REJECTION',
                { errorName: event.reason?.name || typeof event.reason }
            ));
            window.addEventListener('pagehide', persistNow);

            if (resumedFromSession) {
                const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
                push('diagnostic', 'lifecycle', 'DIAGNOSTIC_RESUMED', {
                    readControlEnabled: readControl.enabled
                });
                push('page', 'navigation', 'PAGE_ENTER', {
                    ...routeSnapshot(),
                    navigationType: navigationEntry?.type || 'unknown',
                    visibility: document.visibilityState,
                    hasFocus: document.hasFocus(),
                    resumedDiagnostic: true
                });
            }

            const controller = {
                snapshot
            };
            window.__vgtSiteDiagnosticV060 = controller;

            // VGen f2720d2: reuse its session refresh, channel lookup, API wrapper and modal opener.
            // No token is read, copied into diagnostics, or supplied by this adapter.
            let nativeModuleContext = null;
            const getNativeModuleContext = async () => {
                if (nativeModuleContext) return nativeModuleContext;
                const supportedBuild = [...document.scripts].some((script) => /^https:\/\/assets\.vgen\.co\/f2720d2\//.test(script.src));
                if (!supportedBuild || typeof window.TURBOPACK?.push !== 'function') throw new Error('native-adapter-unavailable');
                const moduleId = 'vgt-native-chat-adapter-v060';
                window.TURBOPACK.push(['vgt-native-chat-adapter', moduleId, (context) => {
                    nativeModuleContext = context; context.s([]);
                }]);
                await window.TURBOPACK.push(['vgt-native-chat-adapter', { otherChunks: [], runtimeModuleIds: [moduleId] }]);
                if (!nativeModuleContext) throw new Error('native-adapter-unavailable');
                return nativeModuleContext;
            };
            const findNativeRecaptcha = () => {
                // Read the already-mounted provider, without accessing user input or credentials.
                const anchors = [...document.querySelectorAll('button, header, nav')].filter((node) => !node.closest('[data-vgt-ui]')).slice(0, 45);
                for (const anchor of anchors) {
                    const value = reactProps(anchor, 'value');
                    if (typeof value?.executeRecaptcha === 'function') return value.executeRecaptcha;
                    for (const key of Reflect.ownKeys(anchor)) {
                        if (!String(key).startsWith('__reactFiber$')) continue;
                        for (let fiber = anchor[key], depth = 0; fiber && depth < 100; fiber = fiber.return, depth++) {
                            const provider = fiber.memoizedProps?.value;
                            if (typeof provider?.executeRecaptcha === 'function') return provider.executeRecaptcha;
                        }
                    }
                }
                return null;
            };
            const waitForNativeChat = async (store, init, statuses) => {
                const get = () => store.getState().chat;
                if (get()?.status === statuses.CONNECTED && get().client) return get().client;
                if (get()?.status === statuses.ERROR) throw new Error('native-chat-unavailable');
                if ([statuses.IDLE, statuses.DISCONNECTED].includes(get()?.status)) init({ dispatch: store.dispatch });
                return new Promise((resolve, reject) => {
                    let unsubscribe = () => {};
                    const timer = window.setTimeout(() => { unsubscribe(); reject(new Error('native-chat-timeout')); }, 20000);
                    const check = () => {
                        const chat = get();
                        if (chat?.status === statuses.CONNECTED && chat.client) { window.clearTimeout(timer); unsubscribe(); resolve(chat.client); }
                        else if (chat?.status === statuses.ERROR) { window.clearTimeout(timer); unsubscribe(); reject(new Error('native-chat-unavailable')); }
                    };
                    unsubscribe = store.subscribe(check); check();
                });
            };
            const openingNativeChats = new Set();
            const openNativeConversation = async (targetUserID) => {
                if (typeof targetUserID !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(targetUserID)) throw new Error('invalid-user-id');
                if (openingNativeChats.has(targetUserID)) return { alreadyOpening: true };
                openingNativeChats.add(targetUserID);
                push('plugin', 'frequent-clients', 'NATIVE_CHAT_OPEN_ATTEMPT', { targetUserId: safeIdentifier(targetUserID) });
                try {
                    const context = await getNativeModuleContext();
                    const store = context.i(841481).default;
                    const queryChannels = context.i(237466).default;
                    const openChannel = context.i(274426).default;
                    const nativeAPI = context.i(442474).default;
                    const session = await context.i(78599).getSessionDetailsWithRefresh();
                    const userID = session?.userID;
                    if (!userID) throw new Error('sign-in-required');
                    if (userID === targetUserID) throw new Error('cannot-chat-with-self');
                    if (session?.moderation?.restriction?.status === 'SUSPENDED') throw new Error('native-chat-restricted');
                    const client = await waitForNativeChat(store, context.i(513318).initStreamConnectAttempts, context.i(595203).CHAT_STATUS);
                    let channels = await queryChannels(client, [userID, targetUserID], { includeArchived: true });
                    if (!channels.length) {
                        const basic = context.i(111406).hasPermissions(session?.moderation?.role, 'BASIC');
                        const executeRecaptcha = basic ? null : findNativeRecaptcha();
                        if (!basic && !executeRecaptcha) throw new Error('native-verification-unavailable');
                        const result = await nativeAPI('/user/chats/initiate', {
                            method: 'POST', getBody: async () => ({ userID, otherUserID: targetUserID,
                                recaptchaToken: basic ? undefined : await executeRecaptcha('chat_initiate') })
                        });
                        if (!result?.ok) throw new Error('native-chat-initiate-failed');
                        channels = await queryChannels(client, [userID, targetUserID], { includeArchived: true });
                    }
                    if (!channels.length) throw new Error('native-channel-unavailable');
                    // Opens VGen's existing modal and loads its native chat data/metadata.
                    openChannel({ channel: channels[0], userID, dispatch: store.dispatch });
                    push('plugin', 'frequent-clients', 'NATIVE_CHAT_OPENED', { targetUserId: safeIdentifier(targetUserID), conversationId: safeIdentifier(channelCID(channels[0])) });
                    return { opened: true };
                } finally { openingNativeChats.delete(targetUserID); }
            };

            window.addEventListener(commandEvent, async (event) => {
                let command;
                try {
                    command = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
                } catch {
                    return;
                }
                const id = String(command?.id || '');
                const action = String(command?.action || '');
                if (action === 'settings:update') {
                    const enabled = Boolean(command.data?.keepUnread);
                    if (readControl.enabled && !enabled) stopReadRuntime();
                    else if (!readControl.enabled && enabled) { readControl.enabled = true; readControl.generation += 1; }
                    readControl.reactionMarkRead = Boolean(command.data?.reactionMarkRead);
                    emitReadEvent('CHAT_SETTINGS_CHANGED', { keepUnread: readControl.enabled, reactionMarkRead: readControl.reactionMarkRead });
                    scheduleMessageRender(); respond(id, 'ok', snapshot()); return;
                }
                if (action === 'chat:open') {
                    try { respond(id, 'ok', await openNativeConversation(command.data?.userID)); }
                    catch (error) {
                        const reasons = new Set(['sign-in-required', 'cannot-chat-with-self', 'native-verification-unavailable',
                            'native-chat-restricted', 'native-chat-unavailable', 'native-chat-timeout', 'native-chat-initiate-failed',
                            'native-channel-unavailable', 'native-adapter-unavailable', 'invalid-user-id']);
                        const reason = reasons.has(error?.message) ? error.message : 'native-adapter-unavailable';
                        push('plugin', 'error', 'NATIVE_CHAT_OPEN_FAILED', { reason });
                        respond(id, 'failed', { reason });
                    }
                    return;
                }
                if (action === 'messages:refresh') {
                    scheduleMessageRender(); respond(id, 'ok'); return;
                }
                if (action === 'start') {
                    if (diagnostic.active) { respond(id, 'already-running', snapshot()); return; }

                    if (persistenceTimer) window.clearTimeout(persistenceTimer);
                    persistenceTimer = 0;
                    diagnostic.active = true;
                    diagnostic.startedAt = { iso: new Date().toISOString(), epoch: Date.now() };
                    diagnostic.endedAt = null;
                    diagnostic.sequence = 0;
                    diagnostic.droppedCount = 0;
                    diagnostic.events = [];

                    push('diagnostic', 'lifecycle', 'DIAGNOSTIC_STARTED', {
                        readControlEnabled: readControl.enabled
                    });
                    emitReadEvent('READ_CONTROL_STATE', { enabled: readControl.enabled, reactionMarkRead: readControl.reactionMarkRead });
                    const navigationEntry = performance.getEntriesByType?.('navigation')?.[0];
                    push('page', 'navigation', 'PAGE_ENTER', {
                        ...routeSnapshot(),
                        navigationType: navigationEntry?.type || 'unknown',
                        visibility: document.visibilityState,
                        hasFocus: document.hasFocus()
                    });
                    stateEvidenceSnapshot();
                    respond(id, 'ok', snapshot());
                    return;
                }
                if (action === 'event') {
                    const data = command?.data && typeof command.data === 'object' ? command.data : {};
                    const payload = data.data && typeof data.data === 'object' ? data.data : {};
                    if (data.category === 'ui') {
                        const activeChannel = findActiveStreamChannel();
                        if (activeChannel?.cid) payload.conversationId = safeIdentifier(activeChannel.cid);
                    }
                    push(
                        safeAction(data.source) || 'plugin',
                        safeAction(data.category) || 'event',
                        safeAction(data.event) || 'UNCLASSIFIED_EVENT',
                        payload
                    );
                    respond(id, 'ok');
                    return;
                }
                if (action === 'stop') {
                    if (!diagnostic.active) { respond(id, 'not-running', snapshot()); return; }
                    detachReadCallObservers();
                    push('diagnostic', 'lifecycle', 'DIAGNOSTIC_STOPPED', {});
                    diagnostic.endedAt = new Date().toISOString();
                    diagnostic.startedAt.endedEpoch = Date.now();
                    diagnostic.active = false;
                    if (persistenceTimer) window.clearTimeout(persistenceTimer);
                    persistenceTimer = 0;
                    persistNow();
                    respond(id, 'ok', snapshot());
                    return;
                }
                if (action === 'snapshot') {
                    respond(id, 'ok', snapshot());
                    return;
                }
                if (action === 'readControl:manualRelease') {
                    try {
                        const result = await manuallyReleaseRead(command.data?.cid);
                        respond(id, 'ok', {
                            ...snapshot(),
                            readControlResult: result
                        });
                    } catch (error) {
                        push('plugin', 'error', 'MANUAL_READ_RELEASE_FAILED', {
                            errorName: error?.name || 'Error'
                        });
                        respond(id, 'failed', {
                            ...snapshot(),
                            readControlResult: { errorName: error?.name || 'Error' }
                        });
                    }
                    return;
                }
                respond(id, 'unknown-command');
            });

            scheduleMessageRender();
            respond('bridge', 'ready', snapshot());
        };

        const source = '(' + bridgeFactory.toString() + ')('
            + JSON.stringify(siteDiagCommandEvent) + ','
            + JSON.stringify(siteDiagResultEvent) + ','
            + JSON.stringify({ keepUnread: settings.keepUnread, reactionMarkRead: settings.reactionMarkRead }) + ');';

        try {
            const pageWindow = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : window;
            pageWindow.Function(source)();
        } catch (error) {
            try {
                const script = document.createElement('script');
                script.textContent = source;
                (document.head || document.documentElement).append(script);
                script.remove();
            } catch (fallbackError) {
                siteDiagnosticRuntime.lastStatus = 'install-failed';
                console.warn(PREFIX, '安装全站行为诊断失败', error, fallbackError);
            }
        }
    }

    function handleSiteDiagnosticResult(event) {
        let result;
        try {
            result = typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail;
        } catch {
            return;
        }
        const id = String(result?.id || '');
        const pending = siteDiagPending.get(id);
        if (pending) {
            siteDiagPending.delete(id);
            window.clearTimeout(pending.timer);
            pending.resolve(result);
        }
        if (result?.status) siteDiagnosticRuntime.lastStatus = result.status;
        if (result?.data && Object.hasOwn(result.data, 'active')) {
            siteDiagnosticRuntime.active = Boolean(result.data.active);
            siteDiagnosticRuntime.startedAt = result.data.startedAt || null;
            siteDiagnosticRuntime.eventCount = Number(result.data.eventCount || 0);
            siteDiagnosticRuntime.droppedCount = Number(result.data.droppedCount || 0);
            if (typeof result.data.readControl?.enabled === 'boolean') {
                readControlEnabled = result.data.readControl.enabled;
            }
        }
    }

    function sendSiteDiagnosticCommand(action, data = {}, timeout = 5000) {
        const id = 'vgt-site-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        return new Promise((resolve) => {
            const timer = window.setTimeout(() => {
                siteDiagPending.delete(id);
                siteDiagnosticRuntime.lastStatus = 'timeout';
                resolve({ id, status: 'timeout' });
            }, timeout);
            siteDiagPending.set(id, { resolve, timer });
            window.dispatchEvent(new CustomEvent(siteDiagCommandEvent, {
                detail: JSON.stringify({ id, action, data })
            }));
        });
    }

    function emitSiteDiagnosticEvent(source, category, event, data = {}) {
        if (!siteDiagnosticRuntime.active) return;
        void sendSiteDiagnosticCommand('event', { source, category, event, data });
    }

    async function startSiteDiagnostic() {
        const result = await sendSiteDiagnosticCommand('start');
        if (result.status !== 'ok') {
            showToast('全站诊断启动失败');
            return;
        }
        siteDiagUISignature = '';
        siteDiagLastUIState = null;
        await recordSiteDiagnosticUI('start', true);
        document.getElementById(DEV_DIALOG_ID)?.close();
        syncMonitorBar();
        showToast('全站监听已开始');
    }

    async function endSiteDiagnostic() {
        if (monitorStopping) return;
        if (!siteDiagnosticRuntime.active) {
            showToast('当前未开启全站监听');
            return;
        }
        monitorStopping = true; syncMonitorBar();
        void recordSiteDiagnosticUI('before-stop', true);
        const result = await sendSiteDiagnosticCommand('stop', {}, 10000);
        monitorStopping = false; syncMonitorBar();
        if (result.status !== 'ok' || !result.data) {
            showToast('结束诊断失败，记录仍保留在页面中');
            return;
        }
        const report = buildSiteDiagnosticReport(result.data);
        if (downloadSiteDiagnosticReport(report)) {
            showToast('全站诊断已结束，JSON 已下载');
        } else {
            const text = JSON.stringify(report, null, 2);
            try {
                GM_setClipboard(text, 'text');
                showToast('自动下载失败，诊断 JSON 已复制');
            } catch (error) {
                console.warn(PREFIX, '导出全站诊断失败', error);
                showToast('诊断导出失败，请查看控制台');
                console.info(PREFIX, text);
            }
        }
    }

    function buildSiteDiagnosticReport(snapshot) {
        return {
            schema: 'vgen-site-behavior-diagnostic/v1',
            generatedAt: new Date().toISOString(),
            plugin: {
                name: 'VGen小工具',
                version: VERSION
            },
            environment: {
                origin: location.origin,
                pageType: classifyDiagnosticPage(location.pathname),
                pathname: sanitiseDiagnosticPath(location.pathname),
                viewport: window.innerWidth + 'x' + window.innerHeight,
                language: navigator.language || null,
                timezoneOffsetMinutes: new Date().getTimezoneOffset()
            },
            diagnostic: {
                startedAt: snapshot.startedAt,
                endedAt: snapshot.endedAt,
                durationMs: snapshot.durationMs,
                eventCount: snapshot.eventCount,
                droppedCount: snapshot.droppedCount
            },
            summary: snapshot.summary,
            errors: (snapshot.events || []).filter((item) => (
                item.category === 'error'
                || /\.error$|_ERROR$|_FAILED$/.test(item.event)
            )),
            privacy: snapshot.privacy,
            readControl: snapshot.readControl,
            pluginState: {
                latestBridge: { ...chatRuntime },
                frequentClients: {
                    saved: clients.length,
                    collapsed: settings.collapsed,
                    minHeight: settings.minHeight
                }
            },
            timeline: snapshot.events || []
        };
    }

    function downloadSiteDiagnosticReport(report) {
        try {
            const text = JSON.stringify(report, null, 2);
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            const timestamp = String(report.generatedAt || new Date().toISOString())
                .replace(/[:.]/g, '-');
            anchor.href = url;
            anchor.download = 'VGen小工具-Site-Diagnostic-' + timestamp + '.json';
            anchor.hidden = true;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1500);
            return true;
        } catch (error) {
            console.warn(PREFIX, '自动下载全站诊断失败', error);
            return false;
        }
    }

    function classifyDiagnosticPage(pathname) {
        const path = String(pathname || '/');
        if (/^\/messages(?:\/|$)/i.test(path)) return 'messages';
        if (/^\/creator\/commissions\/services(?:\/|$)/i.test(path)) return 'creator-services';
        if (/^\/creator\/commissions(?:\/|$)/i.test(path)) return 'creator-commissions';
        if (/^\/creator\/portfolio(?:\/|$)/i.test(path)) return 'creator-portfolio';
        if (/^\/creator(?:\/|$)/i.test(path)) return 'creator';
        if (/^\/settings(?:\/|$)/i.test(path)) return 'settings';
        if (/^\/notifications?(?:\/|$)/i.test(path)) return 'notifications';
        if (/^\/(?:shop|catalogue)(?:\/|$)/i.test(path)) return 'marketplace';
        if (path === '/') return 'home';
        return 'other';
    }

    function diagnosticShortHash(value) {
        const text = String(value || '');
        let hash = 2166136261;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36).slice(0, 8);
    }

    function sanitiseDiagnosticPath(pathname) {
        const safe = new Set([
            'creator', 'commissions', 'services', 'messages', 'portfolio', 'dashboard',
            'settings', 'notifications', 'requests', 'orders', 'shop', 'saved', 'search',
            'catalogue', 'upload', 'new', 'edit', 'login', 'signup', 'about', 'artists'
        ]);
        const segments = String(pathname || '/').split('/').filter(Boolean);
        if (!segments.length) return '/';
        return '/' + segments.map((segment) => safe.has(segment.toLowerCase())
            ? segment
            : ':id#' + diagnosticShortHash(segment)).join('/');
    }

    let messageRefreshTimer = 0;
    function scheduleMessageStateRefresh() {
        if (messageRefreshTimer) return;
        messageRefreshTimer = window.setTimeout(() => {
            messageRefreshTimer = 0;
            void sendSiteDiagnosticCommand('messages:refresh');
        }, 150);
    }

    function showChatSettings() {
        document.getElementById(CHAT_SETTINGS_ID)?.remove();
        const dialog = document.createElement('dialog');
        dialog.id = CHAT_SETTINGS_ID; dialog.dataset.vgtUi = 'settings';
        dialog.className = 'vgt-settings-dialog notranslate'; dialog.translate = false;
        dialog.innerHTML = '<strong>VGen小工具 · 聊天设置</strong>'
            + '<label><input type="checkbox" data-role="keep"> 浏览消息时保持未读</label>'
            + '<p>浏览时暂不提交已读。点击红点或成功发送回复后标记已读。</p>'
            + '<label><input type="checkbox" data-role="reaction"> Emoji 表态后标记已读</label>'
            + '<p>添加表态成功后标记当前会话已读。取消或发送失败不触发。</p>'
            + '<div class="vgt-dev-actions"><button data-role="save">保存</button><button data-role="close">关闭</button></div>';
        dialog.querySelector('[data-role="keep"]').checked = settings.keepUnread;
        dialog.querySelector('[data-role="reaction"]').checked = settings.reactionMarkRead;
        dialog.querySelector('[data-role="save"]').addEventListener('click', async (event) => {
            event.currentTarget.disabled = true;
            const next = { keepUnread: dialog.querySelector('[data-role="keep"]').checked,
                reactionMarkRead: dialog.querySelector('[data-role="reaction"]').checked };
            const result = await sendSiteDiagnosticCommand('settings:update', next);
            if (result.status === 'ok') {
                Object.assign(settings, next); saveSettings(); readControlEnabled = next.keepUnread;
                syncMonitorBar(); dialog.close(); showToast('聊天设置已保存');
            } else { dialog.querySelector('[data-role="save"]').disabled = false; showToast('保存失败，请刷新页面后重试'); }
        });
        dialog.querySelector('[data-role="close"]').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        document.body.append(dialog); dialog.showModal();
    }

    function showDeveloperOptions() {
        document.getElementById(DEV_DIALOG_ID)?.remove();
        const dialog = document.createElement('dialog');
        dialog.id = DEV_DIALOG_ID; dialog.dataset.vgtUi = 'developer';
        dialog.className = 'vgt-settings-dialog notranslate'; dialog.translate = false;
        dialog.innerHTML = '<strong>VGen小工具 · 开发者选项</strong><div>网页监听</div>'
            + '<p data-role="hint"></p><div class="vgt-dev-actions"><button data-role="start">开始全站监听</button>'
            + '<button data-role="close">关闭</button></div>';
        dialog.querySelector('[data-role="hint"]').textContent = siteDiagnosticRuntime.active
            ? '监听正在运行。请使用页面顶部的“停止并导出”。'
            : '记录页面行为用于排错，停止后自动下载 JSON。不记录聊天正文和认证信息。';
        dialog.querySelector('[data-role="start"]').disabled = siteDiagnosticRuntime.active;
        dialog.querySelector('[data-role="start"]').addEventListener('click', () => void startSiteDiagnostic());
        dialog.querySelector('[data-role="close"]').addEventListener('click', () => dialog.close());
        dialog.addEventListener('close', () => dialog.remove(), { once: true });
        document.body.append(dialog); dialog.showModal();
    }

    function syncMonitorBar() {
        if (!document.body) return;
        if (!siteDiagnosticRuntime.active) {
            if (monitorBarTimer) window.clearInterval(monitorBarTimer);
            monitorBarTimer = 0;
            document.getElementById(MONITOR_BAR_ID)?.remove();
            document.getElementById('vgt-monitor-spacer')?.remove();
            document.documentElement.classList.remove('vgt-monitor-active');
            return;
        }
        let bar = document.getElementById(MONITOR_BAR_ID);
        if (!bar) {
            bar = document.createElement('aside'); bar.id = MONITOR_BAR_ID;
            bar.dataset.vgtUi = 'monitor'; bar.className = 'notranslate'; bar.translate = false;
            bar.setAttribute('aria-label', '全站监听状态');
            bar.innerHTML = '<strong>● 全站诊断正在运行 · <span data-role="elapsed">00:00</span></strong>'
                + '<span data-role="experiments"></span><button data-role="stop">停止并导出</button>';
            bar.querySelector('button').addEventListener('click', () => void endSiteDiagnostic());
            const spacer = document.createElement('div'); spacer.id = 'vgt-monitor-spacer'; spacer.dataset.vgtUi = 'monitor';
            document.body.prepend(spacer); document.body.append(bar);
            document.documentElement.classList.add('vgt-monitor-active');
        }
        const seconds = Math.max(0, Math.floor((Date.now() - Date.parse(siteDiagnosticRuntime.startedAt)) / 1000));
        const elapsed = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
        const put = (el, text) => { if (el.textContent !== text) el.textContent = text; };
        put(bar.querySelector('[data-role="elapsed"]'), elapsed);
        put(bar.querySelector('[data-role="experiments"]'), readControlEnabled ? '保持未读：开' : '');
        const stop = bar.querySelector('[data-role="stop"]');
        stop.disabled = monitorStopping; put(stop, monitorStopping ? '正在停止并导出…' : '停止并导出');
        if (!monitorBarTimer) monitorBarTimer = window.setInterval(syncMonitorBar, 1000);
    }

    function scheduleSiteDiagnosticUI(reason = 'mutation') {
        scheduleMessageStateRefresh();
        if (!siteDiagnosticRuntime.active || siteDiagUIFrame) return;
        siteDiagUIFrame = requestAnimationFrame(() => {
            siteDiagUIFrame = 0;
            void recordSiteDiagnosticUI(reason);
        });
    }

    function detectConversationDOMHint() {
        const candidate = document.querySelector(
            '[data-channel-id][aria-selected="true"], [data-cid][aria-selected="true"], '
            + '.str-chat__channel-preview[aria-selected="true"], .str-chat__channel[data-cid]'
        );
        if (!candidate) return null;
        const raw = candidate.getAttribute('data-channel-id')
            || candidate.getAttribute('data-cid')
            || candidate.getAttribute('href')
            || candidate.id;
        return raw ? 'id#' + diagnosticShortHash(raw) : null;
    }

    function collectSiteDiagnosticUIState() {
        const list = document.querySelector('.str-chat__message-list-scroll, .str-chat__list');
        const distanceFromBottom = list
            ? Math.max(0, Math.round(list.scrollHeight - list.scrollTop - list.clientHeight))
            : null;
        return {
            pageType: classifyDiagnosticPage(location.pathname),
            chatOpen: Boolean(document.querySelector('.str-chat__channel, .channelContainer .str-chat')),
            conversationHint: detectConversationDOMHint(),
            messageCount: document.querySelectorAll('.str-chat__message').length,
            unreadBadgeCount: document.querySelectorAll(
                '.str-chat__channel-preview-unread-badge, [data-testid="unread-badge"], [class*="UnreadBadge"], [class*="unreadBadge"]'
            ).length,
            unreadSeparatorCount: document.querySelectorAll(
                '.str-chat__unread-messages-separator, [data-testid="unread-messages-separator"]'
            ).length,
            jumpToPresentVisible: [...document.querySelectorAll('button')].some(
                (button) => /jump to present|跳到当前/i.test(compactText(button.textContent))
            ),
            composerVisible: Boolean(document.querySelector(
                '.str-chat__message-input, .str-chat__message-textarea, textarea[data-testid*="message"]'
            )),
            atBottom: distanceFromBottom === null ? null : distanceFromBottom <= 4,
            distanceFromBottomBucket: distanceFromBottom === null
                ? null
                : distanceFromBottom <= 4 ? '0-4' : distanceFromBottom <= 100 ? '5-100' : '>100',
            panelMounted: Boolean(document.getElementById(PANEL_ID)?.isConnected),
            readControlEnabled,
            redDotCount: document.querySelectorAll('.vgt-state-marker[data-status="unread"]').length,
            pendingReadCount: document.querySelectorAll('.vgt-state-marker[data-status="pending"]').length,
            greenCheckCount: document.querySelectorAll('.vgt-state-marker[data-status="read"]').length,
            visibility: document.visibilityState,
            hasFocus: document.hasFocus()
        };
    }

    async function recordSiteDiagnosticUI(reason, force = false) {
        if (!siteDiagnosticRuntime.active) return;
        const state = collectSiteDiagnosticUIState();
        const signature = JSON.stringify(state);
        if (!force && signature === siteDiagUISignature) return;
        const previous = siteDiagLastUIState;
        const changedKeys = previous
            ? Object.keys(state).filter((key) => previous[key] !== state[key])
            : Object.keys(state);
        siteDiagUISignature = signature;
        siteDiagLastUIState = state;
        await sendSiteDiagnosticCommand('event', {
            source: 'ui',
            category: 'ui',
            event: force && reason === 'start' ? 'UI_INITIAL_STATE' : 'UI_STATE_CHANGED',
            data: { reason, changedKeys, state }
        });
    }

    function installSiteInteractionObservers() {
        document.addEventListener('click', (event) => {
            if (!siteDiagnosticRuntime.active || !(event.target instanceof Element)) return;
            const target = event.target;
            if (target.closest('[data-vgt-ui]')) return;
            const button = target.closest('button, a, [role="button"]');
            if (!button) return;
            let action = null;
            if (button.matches('[class*="sendButton"], [data-testid*="send-button"]')
                || /^(send|发送)$/i.test(compactText(button.getAttribute('aria-label')))) {
                action = 'MESSAGE_SEND_CLICK';
            } else if (button.matches('.str-chat__channel-preview, [data-testid*="channel-preview"]')
                || button.closest('.str-chat__channel-preview, [data-testid*="channel-preview"]')) {
                action = 'CONVERSATION_OPEN';
            } else if (/jump to present|跳到当前/i.test(compactText(button.textContent))) {
                action = 'JUMP_TO_PRESENT';
            } else if (button instanceof HTMLAnchorElement && button.origin === location.origin) {
                action = 'NAVIGATION_CLICK';
            }
            if (!action) return;
            emitSiteDiagnosticEvent('user', 'interaction', action, {
                targetPageType: button instanceof HTMLAnchorElement
                    ? classifyDiagnosticPage(button.pathname)
                    : undefined
            });
        }, true);

        const bottomState = new WeakMap();
        let scrollTimer = 0;
        let lastScrollTarget = null;
        document.addEventListener('scroll', (event) => {
            if (!siteDiagnosticRuntime.active) return;
            const target = event.target instanceof Element
                ? event.target.closest('.str-chat__message-list-scroll, .str-chat__list')
                : null;
            if (!target) return;
            lastScrollTarget = target;
            if (scrollTimer) return;
            scrollTimer = window.setTimeout(() => {
                scrollTimer = 0;
                const list = lastScrollTarget;
                lastScrollTarget = null;
                if (!list) return;
                const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= 4;
                const previous = bottomState.get(list);
                bottomState.set(list, atBottom);
                if (previous === atBottom) return;
                emitSiteDiagnosticEvent(
                    'user',
                    'scroll',
                    atBottom ? 'SCROLL_BOTTOM_REACHED' : 'SCROLL_LEFT_BOTTOM',
                    {}
                );
            }, 140);
        }, true);
        window.addEventListener('resize', syncMonitorBar);
    }
    function markChatStructure(root = document) {
        const reactionContainers = collectMatches(root, '[data-testid="reaction-list"], .str-chat__message-reactions');
        if (root instanceof Element) {
            const ancestor = root.closest('[data-testid="reaction-list"], .str-chat__message-reactions');
            if (ancestor) reactionContainers.push(ancestor);
        }
        [...new Set(reactionContainers)].forEach((reactions) => {
            const list = compactReactionElements(reactions);
            if (!list) return;
            reactions.dataset.vgtReactions = 'true';
            const host = reactions.closest('.str-chat__message-reactions-host') || reactions.parentElement;
            if (host && !host.classList.contains('vgt-reactions-host')) host.classList.add('vgt-reactions-host');
            const inner = reactions.closest('.str-chat__message-inner');
            if (inner && !inner.classList.contains('vgt-has-reactions')) inner.classList.add('vgt-has-reactions');
        });

        const timestamps = collectMatches(
            root,
            '.str-chat__message-simple-timestamp, .str-chat__message-metadata__timestamp, .str-chat__message-metadata time'
        );
        timestamps.forEach((timestamp) => {
            const metadata = timestamp.closest('.str-chat__message-metadata');
            if (metadata) metadata.dataset.vgtMessageMetadata = 'true';
        });

        const messages = collectMatches(root, '.str-chat__message, .str-chat__message-simple');
        if (root instanceof Element) {
            const ancestorMessage = root.closest('.str-chat__message, .str-chat__message-simple');
            if (ancestorMessage) messages.push(ancestorMessage);
        }
        scheduleMessageStateRefresh();

        initialiseNativeLatestActions(root);
    }

    function compactReactionElements(reactions) {
        // VGen's redesigned ChatReactionList uses div > div > button, with data-reaction-type.
        // The older Stream list uses ul > li > button. Neither path requires moving native nodes.
        const buttons = [...reactions.querySelectorAll('button[data-reaction-type], button[data-testid^="reactions-list-button-"]')];
        if (!buttons.length || !reactions.closest('.str-chat__message')) return null;
        const list = reactions.matches('ul') ? reactions : reactions.querySelector('ul.str-chat__message-reactions') || reactions;
        list.dataset.vgtReactionList = 'true';
        for (const button of buttons) {
            const item = button.parentElement;
            if (item && item !== list && item !== reactions && !item.querySelector('.str-chat__message-bubble')) item.dataset.vgtReactionItem = 'true';
        }
        return list;
    }

    function initialiseNativeLatestActions(root = document) {
        const candidates = collectMatches(root, 'button[class*="JumpToPresentButton__Anchor"]');
        if (root.querySelectorAll) {
            root.querySelectorAll('button').forEach((button) => {
                if (/jump to present|跳到当前/i.test(compactText(button.textContent))) candidates.push(button);
            });
        }
        [...new Set(candidates)].forEach(invokeNativeLatestAction);
    }

    function invokeNativeLatestAction(button) {
        if (!button?.isConnected || invokedLatestButtons.has(button)) return;
        const previousAttempts = latestButtonAttempts.get(button) || 0;
        if (previousAttempts >= 12 || Date.now() < (latestButtonNextAttemptAt.get(button) || 0)) return;
        installLatestBridge();
        const attempts = previousAttempts + 1;
        latestButtonAttempts.set(button, attempts);
        latestButtonNextAttemptAt.set(button, Date.now() + Math.min(1200, attempts * 140));
        const requestId = `vgt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        invokedLatestButtons.add(button);
        button.dataset.vgtLatestRequest = requestId;
        chatRuntime.latestRequests += 1;
        chatRuntime.bridgeLastResult = 'requested';
        window.dispatchEvent(new CustomEvent(latestBridgeEvent, { detail: { id: requestId } }));

        window.setTimeout(() => {
            if (button.dataset.vgtLatestRequest !== requestId) return;
            button.removeAttribute('data-vgt-latest-request');
            invokedLatestButtons.delete(button);
            chatRuntime.bridgeLastResult = 'timeout';
            if (!invokeReactLatestFallback(button) && attempts < 12) {
                window.setTimeout(() => scheduleScan(button.isConnected ? button : document), Math.min(1200, attempts * 140));
            }
        }, 7000);
    }

    function installLatestBridge() {
        if (chatRuntime.bridgeInstalled) return;
        chatRuntime.bridgeInstalled = true;
        window.addEventListener(latestBridgeResultEvent, handleLatestBridgeResult);

        const source = `(() => {
            if (window.__vgtLatestBridgeV031) {
                window.dispatchEvent(new CustomEvent('${latestBridgeResultEvent}', { detail: { id: 'bridge', status: 'ready' } }));
                return;
            }
            window.__vgtLatestBridgeV031 = true;
            const respond = (id, status) => window.dispatchEvent(new CustomEvent('${latestBridgeResultEvent}', { detail: { id, status } }));
            const findClickInvocation = (root) => {
                const elements = [root, ...root.querySelectorAll('*')];
                for (const element of elements) {
                    for (const key of Reflect.ownKeys(element)) {
                        const name = String(key);
                        const value = Reflect.get(element, key);
                        if (name.startsWith('__reactProps$') && typeof value?.onClick === 'function') {
                            return { element, handler: value.onClick };
                        }
                        if (name.startsWith('__reactFiber$')) {
                            const handler = value?.memoizedProps?.onClick || value?.pendingProps?.onClick;
                            if (typeof handler === 'function') return { element, handler };
                        }
                    }
                }
                return null;
            };
            const waitForLatest = (button, id) => {
                const list = button.closest('[class*="Chat"], .channelContainer')?.querySelector('.str-chat__list')
                    || document.querySelector('.str-chat__message-list-scroll .str-chat__list');
                const startedAt = performance.now();
                let listChanged = false;
                const observer = list ? new MutationObserver(() => { listChanged = true; }) : null;
                if (observer && list) observer.observe(list, { childList: true, subtree: true });
                const finish = (status) => {
                    observer?.disconnect();
                    respond(id, status);
                };
                const check = () => {
                    const elapsed = performance.now() - startedAt;
                    const distance = list ? list.scrollHeight - list.scrollTop - list.clientHeight : Infinity;
                    const buttonGone = !button.isConnected || getComputedStyle(button).display === 'none';
                    if ((buttonGone || distance <= 4) && (listChanged || elapsed >= 650)) return finish('ok');
                    if (elapsed >= 6000) return finish('incomplete');
                    requestAnimationFrame(check);
                };
                requestAnimationFrame(check);
            };
            window.addEventListener('${latestBridgeEvent}', (event) => {
                const id = String(event.detail?.id || '');
                const button = id ? document.querySelector('button[data-vgt-latest-request="' + id + '"]') : null;
                if (!button) return respond(id, 'button-missing');
                const invocation = findClickInvocation(button);
                if (!invocation) return respond(id, 'handler-missing');
                try {
                    Promise.resolve(invocation.handler.call(invocation.element)).then(
                        () => waitForLatest(button, id),
                        () => respond(id, 'handler-rejected')
                    );
                } catch {
                    respond(id, 'handler-threw');
                }
            });
            respond('bridge', 'ready');
        })();`;

        try {
            const pageWindow = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : window;
            pageWindow.Function(source)();
        } catch (error) {
            try {
                const script = document.createElement('script');
                script.textContent = source;
                (document.head || document.documentElement).append(script);
                script.remove();
            } catch (fallbackError) {
                chatRuntime.bridgeLastResult = 'install-failed';
                console.warn(PREFIX, '安装最新消息状态桥接失败', error, fallbackError);
            }
        }
    }

    function handleLatestBridgeResult(event) {
        const id = String(event.detail?.id || '');
        const status = String(event.detail?.status || 'unknown');
        chatRuntime.bridgeLastResult = status;
        if (id === 'bridge') return;
        const button = document.querySelector(`button[data-vgt-latest-request="${id}"]`);
        if (!button) return;
        button.removeAttribute('data-vgt-latest-request');
        if (status === 'ok') {
            chatRuntime.latestSuccesses += 1;
            settleLatestList(button);
            return;
        }
        invokedLatestButtons.delete(button);
        const attempts = latestButtonAttempts.get(button) || 1;
        const shouldUseFallback = status === 'handler-missing' || status === 'button-missing';
        if (shouldUseFallback && invokeReactLatestFallback(button)) return;
        if (attempts < 12) {
            window.setTimeout(() => scheduleScan(button.isConnected ? button : document), Math.min(1200, attempts * 140));
        }
    }

    function invokeReactLatestFallback(button) {
        if (!button?.isConnected) return false;
        const invocation = getReactClickInvocation(button);
        if (!invocation) return false;
        invokedLatestButtons.add(button);
        try {
            Promise.resolve(invocation.handler.call(invocation.element)).then(() => waitForNativeLatest(button)).then(() => {
                chatRuntime.latestSuccesses += 1;
                chatRuntime.bridgeLastResult = 'fallback-ok';
                settleLatestList(button);
            }).catch((error) => {
                invokedLatestButtons.delete(button);
                chatRuntime.bridgeLastResult = 'fallback-rejected';
                console.warn(PREFIX, '调用 VGen 最新消息动作失败', error);
            });
            return true;
        } catch (error) {
            invokedLatestButtons.delete(button);
            chatRuntime.bridgeLastResult = 'fallback-threw';
            console.warn(PREFIX, '调用 VGen 最新消息动作失败', error);
            return false;
        }
    }

    function getReactClickInvocation(root) {
        const pageWindow = typeof unsafeWindow === 'object' && unsafeWindow ? unsafeWindow : window;
        const elements = [root, ...root.querySelectorAll('*')];
        for (const element of elements) {
            let keys;
            try {
                keys = pageWindow.Reflect.ownKeys(element);
            } catch {
                keys = Reflect.ownKeys(element);
            }
            for (const key of keys) {
                const name = String(key);
                let value;
                try {
                    value = pageWindow.Reflect.get(element, key);
                } catch {
                    value = element[key];
                }
                if (name.startsWith('__reactProps$') && typeof value?.onClick === 'function') {
                    return { element, handler: value.onClick };
                }
                if (name.startsWith('__reactFiber$')) {
                    const handler = value?.memoizedProps?.onClick || value?.pendingProps?.onClick;
                    if (typeof handler === 'function') return { element, handler };
                }
            }
        }
        return null;
    }

    function waitForNativeLatest(button) {
        const list = button.closest('[class*="Chat"], .channelContainer')?.querySelector('.str-chat__list')
            || document.querySelector('.str-chat__message-list-scroll .str-chat__list');
        const startedAt = performance.now();
        let listChanged = false;
        let mutationObserver = null;
        if (list) {
            mutationObserver = new MutationObserver(() => { listChanged = true; });
            mutationObserver.observe(list, { childList: true, subtree: true });
        }
        return new Promise((resolve, reject) => {
            const check = () => {
                const elapsed = performance.now() - startedAt;
                const distance = list ? list.scrollHeight - list.scrollTop - list.clientHeight : Infinity;
                const buttonGone = !button.isConnected || getComputedStyle(button).display === 'none';
                if ((buttonGone || distance <= 4) && (listChanged || elapsed >= 650)) {
                    mutationObserver?.disconnect();
                    resolve();
                    return;
                }
                if (elapsed >= 6000) {
                    mutationObserver?.disconnect();
                    reject(new Error('VGen 最新消息动作未在限定时间内完成'));
                    return;
                }
                requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
        });
    }

    function settleLatestList(button) {
        const list = button.closest('.channelContainer, [class*="Chat"]')?.querySelector('.str-chat__list')
            || document.querySelector('.str-chat__message-list-scroll .str-chat__list');
        if (!list) return;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            list.scrollTo({ top: list.scrollHeight, behavior: 'auto' });
        }));
    }

    function collectMatches(root, selector) {
        const matches = [];
        if (root instanceof Element && root.matches(selector)) matches.push(root);
        if (root.querySelectorAll) matches.push(...root.querySelectorAll(selector));
        return matches;
    }

    function showAddForm() {
        if (!ensurePanel()) {
            showToast('请先打开 VGen 画师仪表盘');
            return;
        }
        openClientManager();
    }

    function showToast(message) {
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            toast.className = 'notranslate';
            toast.translate = false;
            document.body.append(toast);
        }
        toast.textContent = String(message);
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2400);
    }

    function scheduleScan(root = document) {
        const candidate = root instanceof Element || root instanceof Document ? root : document;
        if (candidate === document) pendingScanRoots.clear();
        pendingScanRoots.add(candidate);
        if (scanFrame) return;
        scanFrame = requestAnimationFrame(() => {
            scanFrame = 0;
            const roots = compactScanRoots([...pendingScanRoots]);
            pendingScanRoots.clear();
            try {
                roots.forEach((scanRoot) => markChatStructure(scanRoot?.isConnected === false ? document : scanRoot));
                ensurePanel();
                scheduleSiteDiagnosticUI();
            } catch (error) {
                console.warn(PREFIX, '页面结构扫描失败', error);
            }
        });
    }

    function compactScanRoots(roots) {
        if (roots.includes(document) || roots.length > 80) return [document];
        const connected = roots.filter((root) => root?.isConnected !== false);
        return connected.filter((root, index) => !connected.some((other, otherIndex) => (
            index !== otherIndex
            && other instanceof Element
            && root instanceof Element
            && other.contains(root)
        )));
    }

    function startObserver() {
        if (observer) observer.disconnect();
        observer = new MutationObserver((records) => {
            records.forEach((record) => {
                const target = record.target instanceof Element ? record.target : record.target.parentElement;
                if (target?.closest('[data-vgt-ui]')) return;
                if (record.type === 'childList' && record.addedNodes.length
                    && [...record.addedNodes].every((node) => node instanceof Element && node.hasAttribute('data-vgt-ui'))) return;
                if (record.type === 'characterData') {
                    if (record.target.parentElement) scheduleScan(record.target.parentElement);
                    return;
                }
                if (record.type === 'attributes') {
                    scheduleScan(record.target);
                    return;
                }
                if (!record.addedNodes.length && record.target instanceof Element) scheduleScan(record.target);
                record.addedNodes.forEach((node) => {
                    if (node instanceof Element) scheduleScan(node);
                });
            });
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeFilter: ['class', 'data-theme', 'data-collapsed', 'data-testid', 'aria-label']
        });
    }

    function init() {
        if (!document.body) {
            window.setTimeout(init, 50);
            return;
        }

        ensurePanel();
        installLatestBridge();
        markChatStructure(document);
        startObserver();
        installSiteInteractionObservers();
        syncMonitorBar();
        scheduleMessageStateRefresh();

        GM_registerMenuCommand('VGen小工具：聊天设置', showChatSettings);
        GM_registerMenuCommand('VGen小工具：管理常用访问', showAddForm);
        GM_registerMenuCommand('VGen小工具：开发者选项', showDeveloperOptions);

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !document.getElementById(MODAL_ID)?.hidden) closeClientManager();
        });
        window.addEventListener('popstate', () => scheduleScan(document));
        window.addEventListener('pageshow', () => scheduleScan(document));
        console.info(PREFIX, `v${VERSION} 已启用`);
    }

    init();
})();
