// ChatSearchLocator finds a message element in the scoped chat surface, scrolls
// to it natively, and applies a self-removing highlight. It never mutates the
// message data or the Reaction/Seen/Timestamp layers.

const MESSAGE_ID_SELECTOR = '[data-message-id]';
const HIGHLIGHT_CLASS = 'vgen-nya-search-highlight';
const HIGHLIGHT_MS = 2000;

export class ChatSearchLocator {
    constructor({ surface, documentObject = surface?.ownerDocument || globalThis.document } = {}) {
        this.surface = surface;
        this.documentObject = documentObject;
        this.highlightTimers = new Set();
    }

    findElement(messageId) {
        if (!this.surface?.querySelectorAll || !messageId) return null;
        const wanted = String(messageId);
        const candidates = this.surface.querySelectorAll(MESSAGE_ID_SELECTOR) || [];
        for (const element of candidates) {
            if (element.dataset?.messageId === wanted || element.getAttribute?.('data-message-id') === wanted || element.id === wanted) return element;
        }
        return null;
    }

    scrollTo(element) {
        element?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }

    highlight(element) {
        if (!element) return;
        element.classList?.add?.(HIGHLIGHT_CLASS);
        const timer = this.documentObject?.defaultView?.setTimeout?.(() => element.classList?.remove?.(HIGHLIGHT_CLASS), HIGHLIGHT_MS)
            || globalThis.setTimeout(() => element.classList?.remove?.(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
        this.highlightTimers.add(timer);
    }

    // Locate a message that may not be in the DOM yet. When it is not rendered,
    // `load` (e.g. channel.query with id_around) loads its region into SDK state
    // and we re-check the DOM. The reverse-infinite-scroll list may still not
    // mount it, so the caller reports that honestly instead of faking a message.
    async locateOrLoad(messageId, { load, signal } = {}) {
        const element = this.findElement(messageId);
        if (element) {
            this.scrollTo(element);
            this.highlight(element);
            return { found: true, loads: 0 };
        }
        if (typeof load !== 'function') return { found: false, loads: 0 };
        if (signal?.aborted) return { found: false, loads: 0, aborted: true };
        try {
            await load(messageId);
        } catch {
            return { found: false, loads: 0 };
        }
        const loaded = this.findElement(messageId);
        if (loaded) {
            this.scrollTo(loaded);
            this.highlight(loaded);
            return { found: true, loads: 1 };
        }
        return { found: false, loads: 1 };
    }

    clearHighlights() {
        for (const timer of this.highlightTimers) {
            try { globalThis.clearTimeout(timer); } catch { /* noop */ }
        }
        this.highlightTimers.clear();
        for (const node of this.surface?.querySelectorAll?.(`.${HIGHLIGHT_CLASS}`) || []) node.classList?.remove?.(HIGHLIGHT_CLASS);
    }
}
