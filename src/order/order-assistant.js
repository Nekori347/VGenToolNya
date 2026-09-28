import { ClientBackgroundCache } from './client-background-cache.js';
import { ClientReviewAdapter, REVIEW_SOURCE_STATES } from './client-review-adapter.js';
import { OrderDetailLifecycle } from './order-detail-lifecycle.js';

const ORDER_ASSISTANT_CSS = `
.vgen-nya-order-assistant{margin:8px 0;padding:8px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:9px;background:color-mix(in srgb,currentColor 5%,transparent);color:inherit;font:12px/1.45 system-ui,sans-serif;max-width:100%;position:relative}
.vgen-nya-order-assistant__tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.vgen-nya-order-assistant button{border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;padding:5px 8px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;font:inherit;cursor:pointer}.vgen-nya-order-assistant button:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
.vgen-nya-order-assistant__status{opacity:.72}.vgen-nya-order-assistant__warning{border-color:#d97706!important;background:#f59e0b22!important;color:inherit;font-weight:650}.vgen-nya-order-assistant__error{color:#b42318}
.vgen-nya-order-assistant__popover{margin-top:8px;padding:9px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:8px;background:Canvas;color:CanvasText;box-shadow:0 8px 24px #0003;max-height:320px;overflow:auto}.vgen-nya-order-assistant__popover[hidden]{display:none}.vgen-nya-order-assistant__popover-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.vgen-nya-order-assistant__review{padding:8px 0;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent)}.vgen-nya-order-assistant__review:first-of-type{border-top:0}.vgen-nya-order-assistant__review-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:11px;opacity:.75}.vgen-nya-order-assistant__review-body{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;cursor:text}
`;

function make(documentObject, tagName, className = '', text = '') {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
}

function control(documentObject, text, action) {
    const button = make(documentObject, 'button', 'notranslate', text);
    button.type = 'button';
    button.translate = false;
    button.dataset.action = action;
    return button;
}

export class OrderAssistantSession {
    constructor({ panel, identity, settings, adapter, cache, clipboard, AbortControllerClass = globalThis.AbortController } = {}) {
        this.panel = panel;
        this.identity = identity;
        this.settings = settings;
        this.adapter = adapter;
        this.cache = cache;
        this.clipboard = clipboard;
        this.AbortControllerClass = AbortControllerClass;
        this.root = null;
        this.popover = null;
        this.result = null;
        this.abortController = null;
        this.operation = 0;
        this.feedbackTimers = new Set();
        this.mounted = false;
    }

    mount() {
        if (this.mounted) return false;
        this.mounted = true;
        const documentObject = this.panel.ownerDocument;
        this.root = make(documentObject, 'section', 'vgen-nya-order-assistant');
        this.root.dataset.vgenNyaUi = 'order-assistant';
        this.root.setAttribute('aria-label', 'Client Background');
        (this.identity.mountTarget || this.panel).append(this.root);
        this.render();
        if (this.settings.clientBackground) void this.loadBackground();
        return true;
    }

    render() {
        if (!this.root) return;
        const documentObject = this.root.ownerDocument;
        this.root.replaceChildren();
        const tools = make(documentObject, 'div', 'vgen-nya-order-assistant__tools');
        if (this.settings.copyButtons) {
            const copyId = control(documentObject, 'Copy ID', 'copy-id');
            const copyUrl = control(documentObject, 'Copy Profile URL', 'copy-url');
            copyId.addEventListener('click', () => void this.copy(this.identity.clientId, copyId));
            copyUrl.addEventListener('click', () => void this.copy(this.identity.profileUrl, copyUrl));
            tools.append(copyId, copyUrl);
        }
        if (this.settings.clientBackground) this.#renderBackgroundControl(tools);
        this.root.append(tools);
        if (this.result && [REVIEW_SOURCE_STATES.success, REVIEW_SOURCE_STATES.empty].includes(this.result.state)) {
            this.popover = this.#createPopover();
            this.root.append(this.popover);
        } else this.popover = null;
    }

    #renderBackgroundControl(tools) {
        const documentObject = tools.ownerDocument;
        if (!this.result) {
            tools.append(make(documentObject, 'span', 'vgen-nya-order-assistant__status notranslate', 'Client Background: loading…'));
            return;
        }
        if (this.result.state === REVIEW_SOURCE_STATES.error) {
            tools.append(make(documentObject, 'span', 'vgen-nya-order-assistant__status vgen-nya-order-assistant__error notranslate', '公开评价加载失败'));
            return;
        }
        if (this.result.state === REVIEW_SOURCE_STATES.unavailable) {
            tools.append(make(documentObject, 'span', 'vgen-nya-order-assistant__status notranslate', '公开评价不可用'));
            return;
        }
        if (this.result.state === REVIEW_SOURCE_STATES.empty) {
            tools.append(make(documentObject, 'span', 'vgen-nya-order-assistant__status notranslate', '暂无公开评价'));
            return;
        }
        const lowCount = this.result.lowRatingReviews.length;
        const trigger = control(documentObject, lowCount
            ? `存在 ${lowCount} 条 <5★ 的公开评价`
            : `查看公开评价 (${this.result.reviews.length})`, 'toggle-reviews');
        if (lowCount) trigger.classList.add('vgen-nya-order-assistant__warning');
        trigger.addEventListener('click', () => {
            if (this.popover) this.popover.hidden = !this.popover.hidden;
        });
        tools.append(trigger);
    }

    #createPopover() {
        const documentObject = this.root.ownerDocument;
        const popover = make(documentObject, 'div', 'vgen-nya-order-assistant__popover');
        popover.hidden = true;
        const header = make(documentObject, 'div', 'vgen-nya-order-assistant__popover-head');
        const title = make(documentObject, 'strong', 'notranslate', this.result.lowRatingReviews.length ? '低于 5★ 的公开评价' : '公开评价');
        title.translate = false;
        const close = control(documentObject, 'Close', 'close-reviews');
        close.addEventListener('click', () => { popover.hidden = true; });
        header.append(title, close);
        popover.append(header);
        const reviews = this.result.lowRatingReviews.length ? this.result.lowRatingReviews : this.result.reviews;
        for (const review of reviews) {
            const article = make(documentObject, 'article', 'vgen-nya-order-assistant__review');
            const meta = make(documentObject, 'div', 'vgen-nya-order-assistant__review-meta');
            meta.append(make(documentObject, 'strong', '', `${review.rating}★`));
            for (const value of [review.reviewer, review.date, review.context].filter(Boolean)) meta.append(make(documentObject, 'span', '', value));
            const body = make(documentObject, 'p', 'vgen-nya-order-assistant__review-body', review.body);
            body.translate = true;
            const copy = control(documentObject, 'Copy', 'copy-review');
            copy.addEventListener('click', () => void this.copy(review.body, copy));
            article.append(meta, body, copy);
            popover.append(article);
        }
        return popover;
    }

    async copy(value, button) {
        if (!value) return false;
        const original = button.textContent;
        try {
            await this.clipboard.writeText(value);
            button.textContent = 'Copied';
            return true;
        } catch {
            button.textContent = 'Copy failed';
            return false;
        } finally {
            const expected = button.textContent;
            const timer = globalThis.setTimeout(() => {
                this.feedbackTimers.delete(timer);
                if (button.isConnected !== false && button.textContent === expected) button.textContent = original;
            }, 1200);
            this.feedbackTimers.add(timer);
        }
    }

    async loadBackground() {
        const operation = ++this.operation;
        this.abortController?.abort('superseded');
        this.abortController = this.AbortControllerClass ? new this.AbortControllerClass() : null;
        try {
            const result = await this.cache.load(this.identity, () => this.adapter.fetch(this.identity, { signal: this.abortController?.signal }));
            if (!this.mounted || operation !== this.operation) return;
            this.result = result;
            this.render();
        } catch (error) {
            if (error?.name !== 'AbortError' && this.mounted && operation === this.operation) {
                this.result = { state: REVIEW_SOURCE_STATES.error, reviews: [], lowRatingReviews: [], error: String(error?.message || error) };
                this.render();
            }
        }
    }

    unmount() {
        if (!this.mounted) return false;
        this.mounted = false;
        this.operation += 1;
        this.abortController?.abort('order-session-closed');
        this.abortController = null;
        for (const timer of this.feedbackTimers) globalThis.clearTimeout(timer);
        this.feedbackTimers.clear();
        this.root?.remove();
        this.root = null;
        this.popover = null;
        this.result = null;
        return true;
    }
}

export class OrderAssistantRuntime {
    constructor({ repository, clipboard, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, adapter, cache, detailLifecycle, AbortControllerClass = globalThis.AbortController } = {}) {
        this.repository = repository;
        this.clipboard = clipboard;
        this.documentObject = documentObject;
        this.adapter = adapter || new ClientReviewAdapter({ fetchImpl: globalThis.fetch?.bind(globalThis), DOMParserClass: documentObject?.defaultView?.DOMParser || globalThis.DOMParser });
        this.cache = cache || new ClientBackgroundCache();
        this.detailLifecycle = detailLifecycle || new OrderDetailLifecycle({ documentObject, MutationObserverClass, identityResolver: (panel) => this.adapter.resolveClient(panel) });
        this.AbortControllerClass = AbortControllerClass;
        this.current = null;
        this.session = null;
        this.unsubscribeDetail = null;
        this.unsubscribeSettings = null;
        this.style = null;
        this.mounted = false;
    }

    mount() {
        if (this.mounted || !this.documentObject?.body) return false;
        this.mounted = true;
        this.style = this.documentObject.createElement('style');
        this.style.dataset.vgenNyaUi = 'order-assistant-style';
        this.style.textContent = ORDER_ASSISTANT_CSS;
        (this.documentObject.head || this.documentObject.body).append(this.style);
        this.unsubscribeDetail = this.detailLifecycle.subscribe((event) => this.#onDetail(event));
        this.unsubscribeSettings = this.repository.subscribe(() => this.#sync());
        this.detailLifecycle.mount();
        return true;
    }

    #onDetail(event) {
        if (event.type === 'close') {
            this.current = null;
            this.#releaseSession();
            return;
        }
        this.current = { panel: event.panel, identity: event.identity };
        this.#sync();
    }

    #sync() {
        this.#releaseSession();
        if (!this.current) return;
        const settings = this.repository.read();
        if (!settings.copyButtons && !settings.clientBackground) return;
        this.session = new OrderAssistantSession({
            ...this.current, settings, adapter: this.adapter, cache: this.cache,
            clipboard: this.clipboard, AbortControllerClass: this.AbortControllerClass,
        });
        this.session.mount();
    }

    #releaseSession() {
        this.session?.unmount();
        this.session = null;
    }

    activate() {}
    unmount() {
        if (!this.mounted) return false;
        this.unsubscribeDetail?.();
        this.unsubscribeDetail = null;
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
        this.detailLifecycle.unmount();
        this.#releaseSession();
        this.current = null;
        this.style?.remove();
        this.style = null;
        this.mounted = false;
        return true;
    }
    dispose() { this.unmount(); this.detailLifecycle.dispose(); this.cache.clear(); }
}
