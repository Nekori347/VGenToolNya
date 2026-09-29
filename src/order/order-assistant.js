import { ClientBackgroundCache } from './client-background-cache.js';
import { ClientReviewAdapter, REVIEW_SOURCE_STATES } from './client-review-adapter.js';
import { ExportAdapter, normalizeOrder } from './export-adapter.js';
import { OrderDetailLifecycle } from './order-detail-lifecycle.js';
import { iconSvg } from '../ui/icons.js';

const ORDER_ASSISTANT_CSS = `
.vgen-nya-client-tools,.vgen-nya-client-tools__actions,.vgen-nya-background{--vtq-bg:#ffffff;--vtq-soft:#f3f6fb;--vtq-hover:#e9eef8;--vtq-text:#252a37;--vtq-muted:#737b8e;--vtq-border:rgba(32,45,69,.16);--vtq-blue:#4f7cff;--vtq-green:#20cda7;--vtq-danger:#d84f67;--vtq-warn:#d68b27;font:12px/1.45 system-ui,-apple-system,sans-serif;color:var(--vtq-text)}
@media (prefers-color-scheme:dark){.vgen-nya-client-tools,.vgen-nya-client-tools__actions,.vgen-nya-background{--vtq-bg:#30313f;--vtq-soft:#3a3c4a;--vtq-hover:#454857;--vtq-text:#f2f4f8;--vtq-muted:#b7bdca;--vtq-border:rgba(255,255,255,.14);--vtq-blue:#7195ff;--vtq-green:#3bdfbc;--vtq-danger:#ff7286;--vtq-warn:#f2ad50}}
.vgen-nya-client-tools__actions{position:absolute;top:6px;right:6px;z-index:2;display:grid;gap:4px}
.vgen-nya-client-tools__action{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:1px solid var(--vtq-border);border-radius:7px;background:var(--vtq-soft);color:var(--vtq-muted);cursor:pointer}
.vgen-nya-client-tools__action:hover{border-color:var(--vtq-blue);color:var(--vtq-blue);background:var(--vtq-hover)}
.vgen-nya-client-tools__action:focus-visible{outline:2px solid var(--vtq-blue);outline-offset:1px}
.vgen-nya-background{position:relative;margin-top:6px;width:100%}
.vgen-nya-background__trigger{display:flex;align-items:center;gap:6px;width:100%;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:default}
.vgen-nya-background__trigger:focus-visible{outline:2px solid var(--vtq-blue);outline-offset:2px;border-radius:4px}
.vgen-nya-background__bar{flex:1;height:3px;border-radius:999px;background:var(--vtq-border)}
.vgen-nya-background__bar[data-level="green"]{background:var(--vtq-green)}
.vgen-nya-background__bar[data-level="yellow"]{background:var(--vtq-warn)}
.vgen-nya-background__bar[data-level="red"]{background:var(--vtq-danger)}
.vgen-nya-background__label{font-size:10px;color:var(--vtq-muted);white-space:nowrap}
.vgen-nya-background__popover{position:absolute;left:0;bottom:calc(100% + 8px);z-index:20;display:none;min-width:240px;max-width:340px;max-height:280px;overflow:auto;padding:8px 10px;border:1px solid var(--vtq-border);border-radius:11px;background:var(--vtq-bg);box-shadow:0 14px 38px rgba(0,0,0,.22)}
.vgen-nya-background:hover .vgen-nya-background__popover,.vgen-nya-background:focus-within .vgen-nya-background__popover{display:block}
.vgen-nya-background[data-force-hidden="true"] .vgen-nya-background__popover{display:none!important}
.vgen-nya-background__review{padding:6px 0;border-top:1px solid var(--vtq-border)}
.vgen-nya-background__review:first-child{padding-top:0;border-top:0}
.vgen-nya-background__review-meta{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--vtq-muted)}
.vgen-nya-background__review-status{font-weight:700}
.vgen-nya-background__review-status[data-severity="red"]{color:var(--vtq-danger)}
.vgen-nya-background__review-status[data-severity="yellow"]{color:var(--vtq-warn)}
.vgen-nya-background__review-body{margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;cursor:text;color:var(--vtq-text)}
.vgen-nya-background__review-copy{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:1px solid var(--vtq-border);border-radius:6px;background:transparent;color:var(--vtq-muted);cursor:pointer}
.vgen-nya-background__review-copy:hover{border-color:var(--vtq-blue);color:var(--vtq-blue);background:var(--vtq-hover)}
.vgen-nya-background__empty{margin:0;color:var(--vtq-muted)}
`;

function make(documentObject, tagName, className = '', text = '') {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
}

function iconButton(documentObject, action, name, title) {
    const button = make(documentObject, 'button', 'vgen-nya-client-tools__action notranslate');
    button.type = 'button';
    button.translate = false;
    button.dataset.action = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = iconSvg(name, 14);
    return button;
}

function reviewSeverity(review) {
    if (review.wouldRecommend === false || (Number.isFinite(review.rating) && review.rating <= 3)) return 'red';
    if (Number.isFinite(review.rating) && review.rating === 4) return 'yellow';
    return 'green';
}

function reviewStatusLabel(review) {
    const parts = [];
    if (Number.isFinite(review.rating)) parts.push(`${review.rating}★`);
    if (review.wouldRecommend === false) parts.push('不推荐');
    return parts.join(' · ') || '非满分';
}

export function backgroundLevel(result) {
    if (!result || result.state === REVIEW_SOURCE_STATES.error) return { level: 'muted', label: '背调加载失败' };
    if (result.state === REVIEW_SOURCE_STATES.unavailable) return { level: 'muted', label: '背调不可用' };
    const reviews = Array.isArray(result.reviews) ? result.reviews : [];
    if (!reviews.length) return { level: 'muted', label: '暂无公开评价' };
    let yellow = false;
    for (const review of reviews) {
        if (review.wouldRecommend === false) return { level: 'red', label: '存在不推荐记录' };
        if (Number.isFinite(review.rating) && review.rating <= 3) return { level: 'red', label: '存在低星评价' };
        if (Number.isFinite(review.rating) && review.rating === 4) yellow = true;
    }
    if (yellow) return { level: 'yellow', label: '存在非满分评价' };
    return { level: 'green', label: '评价记录正常' };
}

function backgroundRecords(result) {
    if (!result || result.state !== REVIEW_SOURCE_STATES.success) return [];
    return (Array.isArray(result.reviews) ? result.reviews : []).filter((review) => (
        review.wouldRecommend === false || (Number.isFinite(review.rating) && review.rating < 5)
    ));
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
        this.host = null;
        this.actions = null;
        this.background = null;
        this.popover = null;
        this.bar = null;
        this.label = null;
        this.result = null;
        this.abortController = null;
        this.operation = 0;
        this.feedbackTimers = new Set();
        this.mounted = false;
        this.onKeydown = (event) => { if (event.key === 'Escape') this.background?.setAttribute('data-force-hidden', 'true'); };
        this.onEnter = () => this.background?.removeAttribute('data-force-hidden');
        this.onFocusIn = () => this.background?.removeAttribute('data-force-hidden');
    }

    mount() {
        if (this.mounted) return false;
        this.mounted = true;
        const documentObject = this.panel.ownerDocument;
        this.host = this.identity?.mountTarget || this.panel;
        if (this.host && this.host.dataset?.vgenNyaClientHost === undefined) {
            this.host.dataset.vgenNyaClientHost = this.host.style?.position || '';
            this.host.style.position = 'relative';
        }
        if (this.settings.copyButtons) this.#mountActions(documentObject);
        if (this.settings.clientBackground) {
            this.#mountBackground(documentObject);
            void this.loadBackground();
        }
        return true;
    }

    #mountActions(documentObject) {
        this.actions = make(documentObject, 'div', 'vgen-nya-client-tools__actions');
        this.actions.dataset.vgenNyaUi = 'client-copy-actions';
        const copyId = iconButton(documentObject, 'copy-id', 'copy', '复制 ID');
        const copyUrl = iconButton(documentObject, 'copy-url', 'link', '复制主页链接');
        copyId.addEventListener('click', () => void this.copy(this.identity.clientId, copyId));
        copyUrl.addEventListener('click', () => void this.copy(this.identity.profileUrl, copyUrl));
        this.actions.append(copyId, copyUrl);
        this.host.append(this.actions);
    }

    #mountBackground(documentObject) {
        this.background = make(documentObject, 'div', 'vgen-nya-background');
        this.background.dataset.vgenNyaUi = 'client-background';
        this.background.setAttribute('aria-label', 'Client Background');
        const trigger = make(documentObject, 'button', 'vgen-nya-background__trigger');
        trigger.type = 'button';
        trigger.setAttribute('aria-haspopup', 'true');
        this.bar = make(documentObject, 'span', 'vgen-nya-background__bar');
        this.bar.setAttribute('aria-hidden', 'true');
        this.label = make(documentObject, 'span', 'vgen-nya-background__label notranslate', '背调…');
        this.label.translate = false;
        trigger.append(this.bar, this.label);
        this.background.append(trigger);
        this.background.addEventListener('keydown', this.onKeydown);
        this.background.addEventListener('mouseenter', this.onEnter);
        this.background.addEventListener('focusin', this.onFocusIn);
        this.host.append(this.background);
    }

    render() {
        if (!this.background) return;
        const documentObject = this.background.ownerDocument;
        this.background.querySelector?.('.vgen-nya-background__popover')?.remove();
        this.popover = null;
        const state = backgroundLevel(this.result);
        this.bar.dataset.level = state.level;
        this.label.textContent = state.label;
        const records = backgroundRecords(this.result);
        if (state.level === 'muted' || !records.length) {
            if (state.level !== 'muted' && !records.length) {
                const empty = make(documentObject, 'p', 'vgen-nya-background__empty', '无需要关注的记录');
                this.#createPopover(documentObject, [empty]);
            }
            return;
        }
        const nodes = records.map((review) => this.#reviewNode(documentObject, review));
        this.#createPopover(documentObject, nodes);
    }

    #createPopover(documentObject, children) {
        const popover = make(documentObject, 'div', 'vgen-nya-background__popover');
        popover.setAttribute('role', 'dialog');
        popover.append(...children);
        this.background.append(popover);
        this.popover = popover;
    }

    #reviewNode(documentObject, review) {
        const article = make(documentObject, 'article', 'vgen-nya-background__review');
        const meta = make(documentObject, 'div', 'vgen-nya-background__review-meta notranslate');
        meta.translate = false;
        const status = make(documentObject, 'strong', 'vgen-nya-background__review-status', reviewStatusLabel(review));
        status.dataset.severity = reviewSeverity(review);
        meta.append(status);
        if (review.date) meta.append(make(documentObject, 'span', '', review.date));
        const body = make(documentObject, 'p', 'vgen-nya-background__review-body', review.body);
        body.translate = true;
        const copy = iconButton(documentObject, 'copy-review', 'copy', '复制评价');
        copy.className = 'vgen-nya-background__review-copy notranslate';
        copy.addEventListener('click', () => void this.copy(review.body, copy));
        article.append(meta, body, copy);
        return article;
    }

    // Reuses the already-fetched identity + review context (no re-scrape) to
    // produce the JSON-safe NormalizedOrder a future exporter can consume.
    exportOrder() {
        return new ExportAdapter().toJSON(normalizeOrder(this.identity, this.result));
    }

    async copy(value, button) {
        if (!value) return false;
        const original = button.dataset.copiedLabel;
        try {
            await this.clipboard.writeText(value);
            button.dataset.copied = 'true';
            return true;
        } catch {
            button.dataset.copied = 'failed';
            return false;
        } finally {
            const expected = button.dataset.copied;
            const timer = globalThis.setTimeout(() => {
                this.feedbackTimers.delete(timer);
                if (button.isConnected !== false && button.dataset.copied === expected) delete button.dataset.copied;
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
                this.result = { state: REVIEW_SOURCE_STATES.error, reviews: [], negativeReviews: [], error: String(error?.message || error) };
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
        this.background?.removeEventListener('keydown', this.onKeydown);
        this.background?.removeEventListener('mouseenter', this.onEnter);
        this.background?.removeEventListener('focusin', this.onFocusIn);
        this.actions?.remove();
        this.actions = null;
        this.background?.remove();
        this.background = null;
        this.popover = null;
        this.bar = null;
        this.label = null;
        this.result = null;
        if (this.host?.dataset?.vgenNyaClientHost !== undefined) {
            this.host.style.position = this.host.dataset.vgenNyaClientHost || '';
            delete this.host.dataset.vgenNyaClientHost;
        }
        this.host = null;
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
