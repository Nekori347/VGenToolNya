import { ChatHistoryAdapter } from './chat-history-adapter.js';
import { normalizeSearchText, makeSnippet, sortNewestFirst } from './chat-search-engine.js';
import { ChatSearchLocator } from './chat-search-locator.js';
import { searchAllChannels } from './chat-search-ui.js';
import { streamClientFromDocument, streamSelfId, StreamChatAdapter } from './stream-chat-adapter.js';
import { iconSvg } from '../ui/icons.js';

const NATIVE_SEARCH_SELECTOR = 'input[placeholder*="search" i], input[aria-label*="search" i], input[placeholder*="搜索"], input[aria-label*="搜索"]';
const LIST_SELECTOR = '.str-chat__channel-list, [data-testid*="channel-list"], [class*="ChannelList__Container"]';

const GLOBAL_SEARCH_CSS = `
.vgen-nya-search-enhanced{border-color:color-mix(in srgb,#4f7cff 48%,transparent)!important}
.vgen-nya-search-enhanced:hover{border-color:color-mix(in srgb,#20cda7 60%,transparent)!important}
.vgen-nya-search-enhanced:focus,.vgen-nya-search-enhanced:focus-visible{border-color:#4f7cff!important;outline:none!important;box-shadow:0 0 0 2px color-mix(in srgb,#4f7cff 28%,transparent)!important}
.vgen-nya-search-enhanced::placeholder{color:color-mix(in srgb,currentColor 60%,transparent)}
.vgen-nya-global-results{list-style:none;margin:0;padding:6px 8px;display:grid;gap:4px;max-height:340px;overflow:auto;font:12px/1.4 system-ui,sans-serif;color:inherit}
.vgen-nya-global-results:empty{display:none}
.vgen-nya-global-results__result{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 8px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;cursor:pointer}
.vgen-nya-global-results__result:hover{border-color:color-mix(in srgb,currentColor 34%,transparent);background:color-mix(in srgb,currentColor 9%,transparent)}
.vgen-nya-global-results__avatar{flex:0 0 28px;width:28px;height:28px;border-radius:8px;object-fit:cover;background:color-mix(in srgb,currentColor 12%,transparent)}
.vgen-nya-global-results__meta{flex:1;min-width:0}
.vgen-nya-global-results__name{display:block;overflow:hidden;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.vgen-nya-global-results__id{display:block;color:color-mix(in srgb,currentColor 62%,transparent);font-size:11px}
.vgen-nya-global-results__snippet{display:block;margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.92}
.vgen-nya-global-results__time{flex:0 0 auto;align-self:flex-start;color:color-mix(in srgb,currentColor 55%,transparent);font-size:11px}
`;

function make(documentObject, tagName, className = '', text = '') {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
}

// Global search enhancer for the Messages conversation list. It enhances the
// native "Search direct messages" input (no second search bar) and runs a
// user-triggered cross-conversation full-text search over accessible channels.
export class GlobalSearchRuntime {
    constructor({ documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, chat, historyAdapterFactory, debounceMs = 400, maxChannels = 10, maxPagesPerChannel = 5, pageSize = 100 } = {}) {
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.chat = chat;
        this.historyAdapterFactory = historyAdapterFactory || ((channel) => new ChatHistoryAdapter({ channel }));
        this.debounceMs = debounceMs;
        this.maxChannels = maxChannels;
        this.maxPagesPerChannel = maxPagesPerChannel;
        this.pageSize = pageSize;
        this.style = null;
        this.observer = null;
        this.input = null;
        this.results = null;
        this.listHost = null;
        this.debounceTimer = null;
        this.operation = 0;
        this.mounted = false;
        this.onInput = () => this.#schedule();
        this.onKeydown = (event) => { if (event.key === 'Enter') { event.preventDefault?.(); this.#runNow(); } };
    }

    mount() {
        if (this.mounted || !this.documentObject?.body) return false;
        this.mounted = true;
        this.style = this.documentObject.createElement('style');
        this.style.dataset.vgenNyaUi = 'global-search-style';
        this.style.textContent = GLOBAL_SEARCH_CSS;
        (this.documentObject.head || this.documentObject.body).append(this.style);
        this.#scan(this.documentObject);
        if (this.MutationObserverClass) {
            this.observer = new this.MutationObserverClass((records) => {
                for (const record of records) {
                    for (const node of record.addedNodes || []) if (!this.input) this.#scan(node);
                    for (const node of record.removedNodes || []) {
                        if (node === this.input || node.contains?.(this.input)) this.#release();
                    }
                }
            });
            this.observer.observe(this.documentObject.body, { childList: true });
        }
        return true;
    }

    #findInput(root) {
        for (const input of root?.querySelectorAll?.(NATIVE_SEARCH_SELECTOR) || []) {
            if (typeof input.focus === 'function' || input.isConnected !== false) return input;
        }
        return root?.matches?.(NATIVE_SEARCH_SELECTOR) ? root : null;
    }

    #findListHost(root) {
        const roots = root?.querySelectorAll?.(LIST_SELECTOR) || [];
        let best = null;
        let bestScore = -1;
        for (const candidate of roots) {
            const previews = candidate.querySelectorAll?.('[class*="channel-preview"], [data-testid*="channel-preview"]')?.length || 0;
            if (previews > bestScore) { bestScore = previews; best = candidate; }
        }
        return best || (root?.matches?.(LIST_SELECTOR) ? root : null);
    }

    #scan(root) {
        const input = this.#findInput(root);
        if (!input || input === this.input) return;
        this.#release();
        this.input = input;
        this.listHost = this.#findListHost(root) || this.#findListHost(this.documentObject);
        this.input.classList.add('vgen-nya-search-enhanced');
        this.input.setAttribute('placeholder', '搜索用户或聊天记录…');
        this.input.setAttribute('aria-label', '搜索用户或聊天记录');
        this.input.title = '已增强：可搜索聊天记录';
        this.input.addEventListener('input', this.onInput);
        this.input.addEventListener('keydown', this.onKeydown);
        this.results = make(this.documentObject, 'ul', 'vgen-nya-global-results');
        this.results.dataset.vgenNyaUi = 'global-search-results';
        this.results.translate = false;
        if (typeof this.input.parentElement?.insertBefore === 'function') {
            this.input.parentElement.insertBefore(this.results, this.input.nextSibling || null);
        } else {
            this.input.parentElement?.append?.(this.results);
        }
    }

    #release() {
        this.input?.classList.remove('vgen-nya-search-enhanced');
        this.input?.removeEventListener('input', this.onInput);
        this.input?.removeEventListener('keydown', this.onKeydown);
        this.results?.remove();
        this.results = null;
        this.input = null;
        this.listHost = null;
    }

    #schedule() {
        if (this.debounceTimer !== null) globalThis.clearTimeout(this.debounceTimer);
        this.debounceTimer = globalThis.setTimeout(() => { this.debounceTimer = null; void this.#run(); }, this.debounceMs);
    }

    #runNow() {
        if (this.debounceTimer !== null) { globalThis.clearTimeout(this.debounceTimer); this.debounceTimer = null; }
        void this.#run();
    }

    async #run() {
        if (!this.input) return;
        const operation = ++this.operation;
        const query = this.input.value || '';
        const normalized = normalizeSearchText(query);
        if (!normalized) {
            this.#render([], false);
            return;
        }
        this.#render([], true);
        try {
            const client = streamClientFromDocument(this.documentObject);
            if (!client?.queryChannels) return;
            const selfId = streamSelfId(client);
            const filter = selfId ? { type: 'messaging', members: { $in: [selfId] } } : { type: 'messaging' };
            const channels = await client.queryChannels(filter, [{ last_message_at: -1 }], { watch: false, state: true, limit: 50 });
            const list = Array.isArray(channels) ? channels.slice(0, this.maxChannels) : [];
            const results = await searchAllChannels(normalized, list, {
                historyAdapterFactory: this.historyAdapterFactory,
                selfId,
                maxPages: this.maxPagesPerChannel,
                pageSize: this.pageSize,
                isStale: () => operation !== this.operation,
            });
            if (operation !== this.operation) return;
            this.#render(results, false);
        } catch {
            if (operation !== this.operation) return;
            this.#render([], false);
        }
    }

    #render(results, searching) {
        if (!this.results) return;
        this.results.replaceChildren();
        const documentObject = this.documentObject;
        for (const message of sortNewestFirst(results)) {
            const button = make(documentObject, 'button', 'vgen-nya-global-results__result');
            button.type = 'button';
            button.dataset.messageId = message.messageId;
            button.dataset.userId = message.channel?.userId || '';
            const avatar = make(documentObject, 'img', 'vgen-nya-global-results__avatar');
            avatar.alt = '';
            avatar.src = message.channel?.avatar || '';
            const meta = make(documentObject, 'span', 'vgen-nya-global-results__meta');
            meta.append(
                make(documentObject, 'span', 'vgen-nya-global-results__name', message.channel?.displayName || message.channel?.username || message.authorName || ''),
                make(documentObject, 'span', 'vgen-nya-global-results__id', message.channel?.username ? `@${message.channel.username}` : ''),
            );
            const snippet = make(documentObject, 'span', 'vgen-nya-global-results__snippet', makeSnippet(message.text));
            snippet.translate = true;
            meta.append(snippet);
            const time = make(documentObject, 'span', 'vgen-nya-global-results__time notranslate', message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
            time.translate = false;
            button.append(avatar, meta, time);
            button.addEventListener('click', () => void this.#open(message));
            this.results.append(button);
        }
        if (searching) {
            const status = make(documentObject, 'li', 'vgen-nya-global-results__status', '搜索中…');
            this.results.append(status);
        }
    }

    async #open(message) {
        const userId = message.channel?.userId;
        if (userId) {
            try {
                await StreamChatAdapter.openUser({ userID: userId }, { documentObject: this.documentObject, MutationObserverClass: this.MutationObserverClass });
            } catch {
                // Opening failed; leave the native surface unchanged.
            }
        }
        const surface = this.documentObject.querySelector?.(StreamChatAdapter.overlaySelector);
        if (!surface) return;
        const adapter = new StreamChatAdapter(surface, { documentObject: this.documentObject });
        const channel = adapter.findChannel();
        const history = this.historyAdapterFactory(channel);
        const locator = new ChatSearchLocator({ surface, documentObject: this.documentObject });
        await locator.locateOrLoad(message.messageId, { load: (id) => history.loadAround(id) });
    }

    activate() {}

    unmount() {
        if (!this.mounted) return false;
        this.mounted = false;
        this.operation += 1;
        if (this.debounceTimer !== null) globalThis.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        this.observer?.disconnect();
        this.observer = null;
        this.#release();
        this.style?.remove();
        this.style = null;
        return true;
    }
    dispose() { this.unmount(); }
}
