import { resolvePublicClientIdentity } from './client-review-adapter.js';

const COMMISSION_ID = /\bCOMM#\s*[A-Z0-9]{8,16}\b/i;

export function defaultOrderPanelResolver(root) {
    if (!root?.querySelectorAll) return null;
    if (!COMMISSION_ID.test(String(root.textContent || ''))) return null;
    return resolvePublicClientIdentity(root) ? root : null;
}

export class OrderDetailLifecycle {
    constructor({ documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, panelResolver = defaultOrderPanelResolver, identityResolver = resolvePublicClientIdentity } = {}) {
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.panelResolver = panelResolver;
        this.identityResolver = identityResolver;
        this.listeners = new Set();
        this.observer = null;
        this.panelObserver = null;
        this.panel = null;
        this.identity = null;
        this.probes = new Map();
        this.mounted = false;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        if (this.panel && this.identity) listener({ type: 'open', panel: this.panel, identity: this.identity });
        return () => this.listeners.delete(listener);
    }

    mount() {
        if (this.mounted || !this.documentObject?.body) return false;
        this.mounted = true;
        for (const child of this.documentObject.body.children || []) if (this.#consider(child)) break;
        if (this.MutationObserverClass) {
            this.observer = new this.MutationObserverClass((records) => {
                for (const record of records) {
                    for (const node of record.removedNodes || []) {
                        this.#releaseProbe(node);
                        if (node === this.panel || node.contains?.(this.panel) || this.panel?.isConnected === false) this.#close();
                    }
                    for (const node of record.addedNodes || []) if (!this.#consider(node)) this.#probe(node);
                }
            });
            this.observer.observe(this.documentObject.body, { childList: true });
        }
        return true;
    }

    #consider(root) {
        const panel = this.panelResolver(root);
        if (!panel) return false;
        const identity = this.identityResolver(panel);
        if (!identity) return false;
        if (panel !== this.panel) {
            this.#close();
            this.panel = panel;
            this.identity = identity;
            this.#observePanel();
            this.#releaseProbes();
            this.#emit('open');
        } else if (identity.clientId !== this.identity?.clientId || identity.mountTarget !== this.identity?.mountTarget) {
            this.identity = identity;
            this.#emit('change');
        }
        return true;
    }

    #observePanel() {
        if (!this.MutationObserverClass || !this.panel) return;
        this.panelObserver = new this.MutationObserverClass(() => {
            if (!this.panel || this.panel.isConnected === false) return this.#close();
            const identity = this.identityResolver(this.panel);
            if (identity && (identity.clientId !== this.identity?.clientId || identity.mountTarget !== this.identity?.mountTarget)) {
                this.identity = identity;
                this.#emit('change');
            }
        });
        this.panelObserver.observe(this.panel, { childList: true, subtree: true });
    }

    #emit(type) {
        const event = { type, panel: this.panel, identity: this.identity };
        for (const listener of this.listeners) listener(event);
    }

    #probe(root) {
        if (!root?.querySelector || !this.MutationObserverClass || this.probes.has(root) || this.probes.size >= 12) return false;
        const observer = new this.MutationObserverClass(() => {
            if (root.isConnected === false) this.#releaseProbe(root);
            else if (this.#consider(root)) this.#releaseProbes();
        });
        observer.observe(root, { childList: true, subtree: true });
        const timer = globalThis.setTimeout(() => this.#releaseProbe(root), 8000);
        this.probes.set(root, { observer, timer });
        return true;
    }

    #releaseProbe(root) {
        for (const [candidate, entry] of this.probes) {
            if (candidate !== root && !root?.contains?.(candidate)) continue;
            entry.observer.disconnect();
            globalThis.clearTimeout(entry.timer);
            this.probes.delete(candidate);
        }
    }

    #releaseProbes() {
        for (const [root, entry] of this.probes) {
            entry.observer.disconnect();
            globalThis.clearTimeout(entry.timer);
            this.probes.delete(root);
        }
    }

    #close() {
        if (!this.panel) return false;
        const previous = { panel: this.panel, identity: this.identity };
        this.panelObserver?.disconnect();
        this.panelObserver = null;
        this.panel = null;
        this.identity = null;
        for (const listener of this.listeners) listener({ type: 'close', ...previous });
        return true;
    }

    activate() {}
    unmount() {
        if (!this.mounted) return false;
        this.observer?.disconnect();
        this.observer = null;
        this.#releaseProbes();
        this.#close();
        this.mounted = false;
        return true;
    }
    dispose() { this.unmount(); this.listeners.clear(); }
}
