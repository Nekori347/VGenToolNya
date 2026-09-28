import { StreamChatAdapter } from './stream-chat-adapter.js';
import { QuickReplyController } from './quick-reply.js';

const CHAT_PORTAL_SELECTOR = '.ReactModalPortal, [data-radix-portal], [data-portal], [class*="ChatLauncher__OuterContainer"], [class*="ChatModal__Container"]';

const CHAT_CSS = `
.vgen-nya-chat-meta{display:flex!important;align-items:center;justify-content:space-between;gap:20px;width:100%;padding-top:3px;font:11px/18px system-ui,sans-serif;opacity:.72;user-select:text;pointer-events:auto}
.vgen-nya-chat-time{margin-left:auto;white-space:nowrap}
.str-chat__message-bubble:has(>.vgen-nya-read-marker),.str-chat__message-bubble:has(>.vgen-nya-state-bar){position:relative!important;overflow:visible!important}
.str-chat__message-bubble:has(>.vgen-nya-state-bar){display:flex!important;flex-direction:column!important;height:auto!important}
.vgen-nya-state-bar{position:static!important;display:block!important;flex:0 0 2px!important;width:38px!important;height:2px!important;min-height:2px!important;margin-left:auto!important;border-radius:999px;background:#3bdfbc;opacity:.82;pointer-events:none}
.vgen-nya-state-bar[data-status="unread"]{background:#ff6476}.vgen-nya-state-bar[data-direction="outgoing"]{order:-1;margin-top:1px;margin-bottom:4px}.vgen-nya-state-bar[data-direction="incoming"]{order:2147483647;margin-top:4px;margin-bottom:1px}
.vgen-nya-read-marker{position:absolute!important;right:-8px;z-index:30;width:20px;height:20px;border:0;border-radius:50%;padding:0;background:transparent;color:#3bdfbc;font:bold 16px/20px system-ui;filter:drop-shadow(0 1px 1px #0007)}
.vgen-nya-read-marker[data-direction="outgoing"]{top:-8px}.vgen-nya-read-marker[data-direction="incoming"]{bottom:-8px}.vgen-nya-read-marker[data-status="unread"]{color:#ff6476}.vgen-nya-read-marker[data-manual="true"]{cursor:pointer}.vgen-nya-read-marker[data-manual="true"]:hover,.vgen-nya-read-marker[data-manual="true"]:focus-visible{transform:scale(1.12);outline:2px solid currentColor;outline-offset:1px}
[data-vgen-nya-compact-reactions="true"]{position:static!important;display:flex!important;flex-wrap:wrap!important;gap:3px!important;width:fit-content!important;min-height:0!important;margin:0!important;padding:4px 0 0!important;background:transparent!important;border:0!important;box-shadow:none!important}
[data-vgen-nya-compact-reactions="true"] button[data-reaction-type],[data-vgen-nya-compact-reactions="true"] button[data-testid^="reactions-list-button-"]{min-width:12px!important;height:18px!important;padding:1px 3px!important;border-radius:5px!important;font-size:12px!important}
.vgen-nya-quick-replies,.vgen-nya-order-presets{display:flex;align-items:center;gap:6px;max-width:100%;padding:6px 2px;overflow-x:auto}.vgen-nya-preset-chip{flex:0 0 auto;max-width:220px;padding:5px 9px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 7%,transparent);color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.vgen-nya-preset-chip:hover{background:color-mix(in srgb,currentColor 13%,transparent)}.vgen-nya-preset-chip[aria-pressed="true"]{border-color:#3b82f6;background:#dbeafe;color:#174b8a}.vgen-nya-preset-empty{font:12px/1.4 system-ui,sans-serif;opacity:.62}
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
                if (onlyOwnInsertions || records.every((record) => this.quickReplies?.ownsMutation(record))) return;
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
        return result;
    }

    unmount() {
        if (!this.mounted) return false;
        this.observer?.disconnect();
        this.observer = null;
        this.adapter.cleanup?.();
        this.quickReplies?.cleanup();
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
