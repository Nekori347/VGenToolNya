import { StreamChatAdapter } from './stream-chat-adapter.js';
import { QuickReplyController } from './quick-reply.js';
import { ChatSearchController, CHAT_SEARCH_CSS } from './chat-search-ui.js';

const CHAT_PORTAL_SELECTOR = '.ReactModalPortal, [data-radix-portal], [data-portal], [class*="ChatLauncher__OuterContainer"], [class*="ChatModal__Container"]';

const CHAT_CSS = `
.vgen-nya-status-row{display:flex!important;align-items:center!important;width:100%!important;box-sizing:border-box!important;margin:0!important;padding:2px 2px 0 10px!important}
.vgen-nya-status-row .vgen-nya-state-bar{flex:1!important;height:2px!important;min-width:0!important;border-radius:999px;background:#3bdfbc;opacity:.85;pointer-events:none}
.vgen-nya-status-row .vgen-nya-state-bar[data-status="unread"]{background:#ff6476}
.vgen-nya-status-row .vgen-nya-state-bar[data-status="pending"]{background:#e6a2ad}
.vgen-nya-status-row .vgen-nya-read-marker{flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:16px!important;height:16px!important;margin-left:4px!important;padding:0!important;border:0!important;border-radius:50%!important;background:transparent!important;color:#3bdfbc!important;font:bold 13px/16px system-ui!important;filter:drop-shadow(0 1px 1px #0007)}
.vgen-nya-status-row .vgen-nya-read-marker[data-status="unread"]{color:#ff6476}
.vgen-nya-status-row .vgen-nya-read-marker[data-status="pending"]{color:#e6a2ad}
.vgen-nya-status-row .vgen-nya-read-marker[data-manual="true"]{cursor:pointer}
.vgen-nya-status-row .vgen-nya-read-marker[data-manual="true"]:hover,.vgen-nya-status-row .vgen-nya-read-marker[data-manual="true"]:focus-visible{transform:scale(1.15);outline:2px solid currentColor;outline-offset:1px}
.vgen-nya-chat-meta{display:flex!important;align-items:center;justify-content:space-between;gap:20px;width:100%;padding-top:3px;font:11px/18px system-ui,sans-serif;opacity:.72;user-select:text;pointer-events:auto}
.vgen-nya-chat-time{margin-left:auto;white-space:nowrap}
[data-vgen-nya-compact-reactions="true"]{--str-chat__stream-emoji-size:12px!important;position:static!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:3px!important;width:fit-content!important;min-height:0!important;margin:0!important;padding:4px 0 0!important;background:transparent!important;border:0!important;box-shadow:none!important}
.str-chat__message-bubble-group[data-vgen-nya-message-side="outgoing"] [data-vgen-nya-compact-reactions="true"]{margin-left:auto!important}
.str-chat__message-bubble-group[data-vgen-nya-message-side="incoming"] [data-vgen-nya-compact-reactions="true"]{margin-right:auto!important}
[data-vgen-nya-compact-reactions="true"] button[data-reaction-type],[data-vgen-nya-compact-reactions="true"] button[data-testid^="reactions-list-button-"]{min-width:12px!important;height:18px!important;padding:1px 3px!important;border-radius:5px!important;font-size:12px!important;box-shadow:0 0 0 1px color-mix(in srgb,currentColor 28%,transparent)!important}
[data-vgen-nya-compact-reactions="true"] :is(svg,img){width:12px!important;height:12px!important;max-width:12px!important;max-height:12px!important}
.vgen-nya-quick-replies,.vgen-nya-order-presets{display:flex;align-items:center;gap:6px;max-width:100%;padding:6px 2px;overflow-x:auto}.vgen-nya-preset-chip{flex:0 0 auto;max-width:220px;padding:5px 9px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 7%,transparent);color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.vgen-nya-preset-chip:hover{background:color-mix(in srgb,currentColor 13%,transparent)}.vgen-nya-preset-chip[aria-pressed="true"]{border-color:#3b82f6;background:#dbeafe;color:#174b8a}.vgen-nya-preset-empty{font:12px/1.4 system-ui,sans-serif;opacity:.62}
[data-vgen-nya-native-latest="true"]{z-index:40!important;scroll-margin-bottom:8px!important}
${CHAT_SEARCH_CSS}
.vgen-nya-search-highlight{outline:2px solid #f59e0b!important;outline-offset:1px;border-radius:8px}
`;

export class ChatAssistantSession {
    constructor({ surface, repository, readGate, adapter, textPresetEngine, MutationObserverClass = globalThis.MutationObserver } = {}) {
        this.surface = surface;
        this.repository = repository;
        this.readGate = readGate;
        this.adapter = adapter;
        this.MutationObserverClass = MutationObserverClass;
        this.observer = null;
        this.cid = null;
        this.mounted = false;
        this.quickReplies = textPresetEngine ? new QuickReplyController({ engine: textPresetEngine, adapter }) : null;
        this.search = new ChatSearchController({ surface, adapter, documentObject: surface?.ownerDocument || globalThis.document });
    }

    mount() {
        if (this.mounted) return false;
        this.mounted = true;
        this.refresh();
        if (this.MutationObserverClass) {
            this.observer = new this.MutationObserverClass((records) => {
                const onlyOwnInsertions = records.length > 0 && records.every((record) => (
                    (record.addedNodes?.length || 0) > 0
                    && [...record.addedNodes].every((node) => node.dataset?.vgenNyaUi)
                ));
                if (onlyOwnInsertions || records.every((record) => this.quickReplies?.ownsMutation(record) || this.search?.ownsMutation(record))) return;
                this.refresh();
            });
            this.observer.observe(this.surface, { childList: true, subtree: true });
        }
        return true;
    }

    refresh() {
        if (!this.mounted) return null;
        const settings = this.repository.read().chatSettings;
        const result = this.adapter.refresh({
            settings,
            readGate: this.readGate,
            onManualRead: (cid, channel) => this.readGate.manualRelease(cid, (body) => channel.markRead?.(body)),
        });
        this.cid = result?.cid || null;
        this.quickReplies?.refresh();
        this.#syncSearch(settings);
        return result;
    }

    #syncSearch(settings) {
        if (settings.searchEnabled !== false) {
            this.search.mount();
            this.search.refresh();
        } else {
            this.search.unmount();
        }
    }

    unmount() {
        if (!this.mounted) return false;
        this.observer?.disconnect();
        this.observer = null;
        this.adapter.cleanup?.();
        this.quickReplies?.cleanup();
        this.search.dispose?.();
        this.cid = null;
        this.mounted = false;
        return true;
    }
}

export class ChatAssistantRuntime {
    constructor({ repository, readGate, networkHooks, textPresetEngine, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, adapterFactory } = {}) {
        this.repository = repository;
        this.readGate = readGate;
        this.networkHooks = networkHooks;
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.adapterFactory = adapterFactory || ((surface) => new StreamChatAdapter(surface, { documentObject, MutationObserverClass }));
        this.textPresetEngine = textPresetEngine;
        this.sessions = new Map();
        this.probes = new Map();
        this.portalObserver = null;
        this.unsubscribe = null;
        this.style = null;
        this.mounted = false;
    }

    mount() {
        if (this.mounted) return false;
        this.mounted = true;
        this.unsubscribe = this.repository.subscribe(() => this.#sync());
        this.#sync();
        return true;
    }

    #sync() {
        const settings = this.repository.read().chatSettings;
        this.readGate.configure(settings);
        this.networkHooks.configureRead(settings.enabled && settings.keepUnread);
        if (settings.enabled) this.#start();
        else this.#stop();
        for (const session of this.sessions.values()) session.refresh();
    }

    #start() {
        if (this.portalObserver || !this.documentObject?.body) return;
        this.#installStyle();
        this.scan(this.documentObject);
        if (this.MutationObserverClass) {
            this.portalObserver = new this.MutationObserverClass((records) => {
                for (const record of records) {
                    for (const node of record.addedNodes || []) if (!this.scan(node)) this.#probe(node);
                    for (const node of record.removedNodes || []) this.#releaseRemoved(node);
                }
            });
            this.portalObserver.observe(this.documentObject.body, { childList: true });
        }
    }

    #stop() {
        this.portalObserver?.disconnect();
        this.portalObserver = null;
        for (const root of [...this.probes.keys()]) this.#releaseProbe(root);
        for (const session of this.sessions.values()) session.unmount();
        this.sessions.clear();
        this.style?.remove();
        this.style = null;
    }

    #installStyle() {
        if (this.style || !this.documentObject?.createElement) return;
        this.style = this.documentObject.createElement('style');
        this.style.dataset.vgenNyaUi = 'chat-style';
        this.style.textContent = CHAT_CSS;
        (this.documentObject.head || this.documentObject.body).append(this.style);
    }

    scan(root) {
        const selector = StreamChatAdapter.overlaySelector;
        const candidates = [...new Set([
            ...(root?.matches?.(selector) ? [root] : []),
            ...(root?.querySelectorAll?.(selector) || []),
        ])];
        const surfaces = [...new Set(candidates.map((candidate) => this.#sessionSurface(candidate)))];
        let mounted = 0;
        for (const surface of surfaces) {
            if (this.sessions.has(surface) || !surface.isConnected) continue;
            if ([...this.sessions.keys()].some((existing) => existing.contains?.(surface))) continue;
            const adapter = this.adapterFactory(surface);
            const session = new ChatAssistantSession({ surface, repository: this.repository, readGate: this.readGate, adapter, textPresetEngine: this.textPresetEngine, MutationObserverClass: this.MutationObserverClass });
            session.mount();
            this.sessions.set(surface, session);
            mounted += 1;
        }
        return mounted;
    }

    #sessionSurface(channelRoot) {
        let node = channelRoot;
        for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
            if (String(node.className || '').includes('ChatModal__Container')) return node;
        }
        return channelRoot;
    }

    #probe(root) {
        if (!this.MutationObserverClass || !root?.querySelectorAll || this.probes.has(root)) return;
        const likelyPortal = root.matches?.(CHAT_PORTAL_SELECTOR) || root.querySelector?.(CHAT_PORTAL_SELECTOR);
        if (!likelyPortal) return;
        const observer = new this.MutationObserverClass(() => {
            if (!root.isConnected || this.scan(root)) this.#releaseProbe(root);
        });
        observer.observe(root, { childList: true, subtree: true });
        const timer = globalThis.setTimeout(() => this.#releaseProbe(root), 10000);
        this.probes.set(root, { observer, timer });
    }

    #releaseProbe(root) {
        const probe = this.probes.get(root);
        if (!probe) return;
        probe.observer.disconnect();
        globalThis.clearTimeout(probe.timer);
        this.probes.delete(root);
    }

    #releaseRemoved(root) {
        for (const probeRoot of [...this.probes.keys()]) if (probeRoot === root || root.contains?.(probeRoot) || !probeRoot.isConnected) this.#releaseProbe(probeRoot);
        for (const [surface, session] of this.sessions) {
            if (surface === root || root.contains?.(surface) || !surface.isConnected) {
                session.unmount();
                this.sessions.delete(surface);
            }
        }
    }

    activate() {}

    unmount() {
        if (!this.mounted) return false;
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.#stop();
        this.networkHooks.configureRead(false);
        this.readGate.cancelAll('chat-runtime-unmounted');
        this.mounted = false;
        return true;
    }

    dispose() { this.unmount(); }
}

export class ChatService {
    constructor({ documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, openUser = StreamChatAdapter.openUser } = {}) {
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.openUserAdapter = openUser;
    }

    openUser(target) {
        return this.openUserAdapter(target, { documentObject: this.documentObject, MutationObserverClass: this.MutationObserverClass });
    }
}
