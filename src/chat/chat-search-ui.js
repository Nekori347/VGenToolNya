import { ChatHistoryAdapter, normalizeChatMessage } from './chat-history-adapter.js';
import { ChatSearchEngine, normalizeSearchText, matchesQuery, makeSnippet, SEARCH_STATES, sortNewestFirst } from './chat-search-engine.js';
import { ChatSearchLocator } from './chat-search-locator.js';
import { iconSvg } from '../ui/icons.js';

export const CHAT_SEARCH_CSS = `
.vgen-nya-chat-search{position:relative;margin:0 0 8px;padding:0;font:12px/1.4 system-ui,sans-serif;color:inherit;max-width:100%}
.vgen-nya-chat-search__bar{position:relative;display:flex;align-items:center}
.vgen-nya-chat-search input{flex:1;min-width:0;height:30px;padding:4px 30px 4px 10px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:8px;background:Canvas;color:CanvasText;font:inherit}
.vgen-nya-chat-search input:focus-visible{outline:2px solid #3b82f6;outline-offset:1px}
.vgen-nya-chat-search__icon{position:absolute;right:7px;display:flex;align-items:center;color:color-mix(in srgb,currentColor 55%,transparent);pointer-events:none}
.vgen-nya-chat-search__status{margin:5px 1px 0;opacity:.75;font-size:11px}
.vgen-nya-chat-search__status[data-error="true"]{color:#b42318}
.vgen-nya-chat-search__results{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px;max-height:320px;overflow:auto}
.vgen-nya-chat-search__result{display:block;width:100%;text-align:left;padding:6px 8px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;cursor:pointer}
.vgen-nya-chat-search__result:hover{border-color:color-mix(in srgb,currentColor 34%,transparent);background:color-mix(in srgb,currentColor 9%,transparent)}
.vgen-nya-chat-search__time{display:block;color:color-mix(in srgb,currentColor 55%,transparent);font-size:11px}
.vgen-nya-chat-search__snippet{display:block;margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.92}
`;

function make(documentObject, tagName, className = '', text = '') {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
}

function channelCid(channel) {
    return channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null);
}

export function channelDisplayInfo(channel, selfId) {
    const members = channel?.state?.members || channel?.data?.members || {};
    const list = Array.isArray(members) ? members : Object.values(members);
    const other = list.find((member) => {
        const id = member?.user?.id || member?.user_id || member?.id;
        return id && String(id) !== String(selfId);
    }) || list[0];
    return {
        userId: other?.user?.id || other?.user_id || other?.id || null,
        displayName: other?.user?.name || other?.user?.username || other?.name || '',
        username: other?.user?.username || other?.username || '',
        avatar: other?.user?.image || other?.user?.avatarURL || '',
    };
}

// Searches one channel's history (paginated + local substring) and returns
// matches decorated with the channel's display info. Never writes.
export async function searchChannel(query, channel, { historyAdapterFactory, selfId, maxPages = 5, pageSize = 100, signal, operation, isStale } = {}) {
    const cid = channelCid(channel);
    const history = historyAdapterFactory(channel);
    const info = channelDisplayInfo(channel, selfId);
    const matches = [];
    const seen = new Set();
    const loaded = history.loadedMessages?.() || [];
    for (const message of loaded) {
        if (seen.has(message.messageId) || !matchesQuery(message.text, query)) continue;
        seen.add(message.messageId);
        matches.push({ ...message, cid, channel: info });
    }
    let before = null;
    for (let page = 0; page < maxPages; page += 1) {
        if (isStale?.() || signal?.aborted) break;
        const result = await history.fetchHistoryPage({ before, limit: pageSize, signal });
        if (!result?.available) break;
        const messages = result.messages || [];
        for (const message of messages) {
            if (seen.has(message.messageId) || !matchesQuery(message.text, query)) continue;
            seen.add(message.messageId);
            matches.push({ ...message, cid, channel: info });
        }
        if (!messages.length || messages.length < pageSize) break;
        before = messages[0].messageId;
    }
    return matches;
}

// Aggregates a user-triggered global search across accessible conversations.
export async function searchAllChannels(query, channels, options = {}) {
    const normalized = normalizeSearchText(query);
    const results = [];
    const concurrency = options.concurrency || 3;
    let index = 0;
    async function worker() {
        while (index < channels.length) {
            const channel = channels[index];
            index += 1;
            if (options.isStale?.() || options.signal?.aborted) return;
            const matches = await searchChannel(normalized, channel, options);
            results.push(...matches);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, channels.length || 1) }, () => worker()));
    return sortNewestFirst(results);
}

function defaultSidebarResolver(documentObject, surface) {
    const modal = surface?.closest?.('[class*="ChatModal"], .str-chat, [class*="chatModal"]') || documentObject;
    for (const root of modal.querySelectorAll?.('[class*="Client"], [class*="client"], [class*="Detail"], [class*="detail"], [class*="Sidebar"], [class*="sidebar"]') || []) {
        if (root === surface || root.contains?.(surface) || surface?.contains?.(root)) continue;
        if (/client|commission|detail/i.test(String(root.textContent || '').slice(0, 400))) return root;
    }
    return null;
}

// Current-conversation search: a compact search box placed at the top of the
// chat right sidebar (above the Client section). It searches only the active
// channel's history (loaded + id_lt pagination) and reuses ChatSearchEngine /
// ChatSearchLocator. Never writes.
export class ChatSearchController {
    constructor({ surface, adapter, documentObject = surface?.ownerDocument || globalThis.document, historyAdapterFactory, locatorFactory, sidebarResolver = defaultSidebarResolver, debounceMs = 400, pageSize = 100 } = {}) {
        this.surface = surface;
        this.adapter = adapter;
        this.documentObject = documentObject;
        this.historyAdapterFactory = historyAdapterFactory || ((channel) => new ChatHistoryAdapter({ channel }));
        this.locatorFactory = locatorFactory || (() => new ChatSearchLocator({ surface, documentObject }));
        this.locator = this.locatorFactory();
        this.sidebarResolver = sidebarResolver;
        this.debounceMs = debounceMs;
        this.pageSize = pageSize;
        this.engine = new ChatSearchEngine({});
        this.root = null;
        this.input = null;
        this.statusNode = null;
        this.listNode = null;
        this.debounceTimer = null;
        this.mounted = false;
        this.onInput = () => this.#schedule();
        this.onKeydown = (event) => { if (event.key === 'Enter') { event.preventDefault?.(); this.#runNow(); } };
        this.unsubscribeEngine = this.engine.subscribe(() => this.#render());
    }

    mount() {
        if (this.mounted || !this.documentObject?.createElement) return false;
        const host = this.sidebarResolver(this.documentObject, this.surface) || this.surface;
        if (!host) return false;
        this.mounted = true;
        this.root = make(this.documentObject, 'div', 'vgen-nya-chat-search notranslate');
        this.root.dataset.vgenNyaUi = 'current-chat-search';
        this.root.translate = false;
        const bar = make(this.documentObject, 'div', 'vgen-nya-chat-search__bar');
        this.input = make(this.documentObject, 'input', '');
        this.input.type = 'text';
        this.input.placeholder = '搜索当前聊天记录…';
        this.input.setAttribute('aria-label', '搜索当前聊天记录');
        this.input.addEventListener('input', this.onInput);
        this.input.addEventListener('keydown', this.onKeydown);
        const icon = make(this.documentObject, 'span', 'vgen-nya-chat-search__icon');
        icon.innerHTML = iconSvg('search', 15);
        icon.setAttribute('aria-hidden', 'true');
        bar.append(this.input, icon);
        this.statusNode = make(this.documentObject, 'p', 'vgen-nya-chat-search__status notranslate');
        this.statusNode.translate = false;
        this.listNode = make(this.documentObject, 'ul', 'vgen-nya-chat-search__results');
        this.root.append(bar, this.statusNode, this.listNode);
        if (typeof host.prepend === 'function') host.prepend(this.root);
        else if (typeof host.insertBefore === 'function' && host.firstChild) host.insertBefore(this.root, host.firstChild);
        else host.append?.(this.root);
        return true;
    }

    ownsMutation(record) {
        return Boolean(this.root && (record?.target === this.root || this.root.contains?.(record?.target)));
    }

    refresh() {
        // Channel change clears the in-flight search and any stale results.
        this.engine.cancel('channel-change');
        if (this.input) this.input.value = '';
        this.#render();
    }

    #channel() {
        return this.adapter?.findChannel?.() || null;
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
        const query = this.input.value || '';
        const normalized = normalizeSearchText(query);
        const channel = this.#channel();
        if (!normalized) {
            this.engine.cancel('query-cleared');
            this.#render();
            return;
        }
        if (!channel) {
            this.#setStatus('无法读取当前会话', true);
            return;
        }
        const cid = channel.cid || (channel.type && channel.id ? `${channel.type}:${channel.id}` : null);
        await this.engine.search({ query: normalized, history: this.historyAdapterFactory(channel), cid });
    }

    #render() {
        if (!this.root) return;
        // An empty query always collapses the results list, regardless of any
        // in-flight engine state.
        if (!normalizeSearchText(this.input?.value || '')) {
            this.listNode.replaceChildren();
            this.#setStatus('', false);
            return;
        }
        const snapshot = this.engine.snapshot;
        this.listNode.replaceChildren();
        const documentObject = this.documentObject;
        for (const message of snapshot.results) {
            const button = make(documentObject, 'button', 'vgen-nya-chat-search__result');
            button.type = 'button';
            button.dataset.messageId = message.messageId;
            const time = make(documentObject, 'span', 'vgen-nya-chat-search__time notranslate', message.createdAt ? new Date(message.createdAt).toLocaleString?.([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) || message.createdAt : '');
            time.translate = false;
            const snippet = make(documentObject, 'span', 'vgen-nya-chat-search__snippet', makeSnippet(message.text));
            snippet.translate = true;
            button.append(time, snippet);
            button.addEventListener('click', () => void this.#open(message.messageId));
            this.listNode.append(button);
        }
        if (snapshot.state === SEARCH_STATES.searching) this.#setStatus('搜索中…', false);
        else if (snapshot.state === SEARCH_STATES.error) this.#setStatus(`搜索失败：${snapshot.error || '未知错误'}`, true);
        else if (snapshot.state === SEARCH_STATES.results) this.#setStatus(snapshot.partial ? '部分历史已搜索' : '', false);
        else if (snapshot.state === SEARCH_STATES.empty) this.#setStatus('无结果', false);
        else this.#setStatus('', false);
    }

    async #open(messageId) {
        const channel = this.#channel();
        const history = this.historyAdapterFactory(channel);
        await this.locator.locateOrLoad(messageId, { load: (id) => history.loadAround(id) });
    }

    #setStatus(text, error) {
        if (!this.statusNode) return;
        this.statusNode.textContent = text;
        this.statusNode.dataset.error = error ? 'true' : 'false';
    }

    unmount() {
        if (!this.mounted) return false;
        this.mounted = false;
        if (this.debounceTimer !== null) globalThis.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        this.engine.cancel('session-closed');
        this.locator.clearHighlights();
        this.input?.removeEventListener('input', this.onInput);
        this.input?.removeEventListener('keydown', this.onKeydown);
        this.root?.remove();
        this.root = null;
        this.input = null;
        this.statusNode = null;
        this.listNode = null;
        return true;
    }

    dispose() {
        this.unmount();
        this.unsubscribeEngine?.();
        this.unsubscribeEngine = null;
    }
}
