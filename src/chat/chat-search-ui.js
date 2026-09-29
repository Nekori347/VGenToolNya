import { ChatHistoryAdapter, normalizeChatMessage } from './chat-history-adapter.js';
import { normalizeSearchText, matchesQuery, makeSnippet, sortNewestFirst } from './chat-search-engine.js';
import { ChatSearchLocator } from './chat-search-locator.js';
import { iconSvg } from '../ui/icons.js';

const LIST_SELECTOR = '.str-chat__channel-list, [data-testid*="channel-list"], [class*="ChannelList__Container"]';
const PREVIEW_SELECTOR = '.str-chat__channel-preview, [data-testid*="channel-preview"], [class*="ChatChannelListPreview"]';

export const CHAT_SEARCH_CSS = `
.vgen-nya-chat-search{position:relative;margin:0;padding:8px;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,currentColor 3%,transparent);font:12px/1.4 system-ui,sans-serif;color:inherit;max-width:100%}
.vgen-nya-chat-search__bar{position:relative;display:flex;align-items:center}
.vgen-nya-chat-search input{flex:1;min-width:0;height:30px;padding:4px 30px 4px 10px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:8px;background:Canvas;color:CanvasText;font:inherit}
.vgen-nya-chat-search input:focus-visible{outline:2px solid #3b82f6;outline-offset:1px}
.vgen-nya-chat-search__icon{position:absolute;right:7px;display:flex;align-items:center;color:color-mix(in srgb,currentColor 55%,transparent);pointer-events:none}
.vgen-nya-chat-search__status{margin:5px 1px 0;opacity:.75;font-size:11px}
.vgen-nya-chat-search__status[data-error="true"]{color:#b42318}
.vgen-nya-chat-search__results{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:4px;max-height:420px;overflow:auto}
.vgen-nya-chat-search__result{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 8px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;cursor:pointer}
.vgen-nya-chat-search__result:hover{border-color:color-mix(in srgb,currentColor 34%,transparent);background:color-mix(in srgb,currentColor 9%,transparent)}
.vgen-nya-chat-search__avatar{flex:0 0 28px;width:28px;height:28px;border-radius:8px;object-fit:cover;background:color-mix(in srgb,currentColor 12%,transparent)}
.vgen-nya-chat-search__meta{flex:1;min-width:0}
.vgen-nya-chat-search__name{display:block;overflow:hidden;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
.vgen-nya-chat-search__id{display:block;color:color-mix(in srgb,currentColor 62%,transparent);font-size:11px}
.vgen-nya-chat-search__snippet{display:block;margin-top:2px;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.92}
.vgen-nya-chat-search__time{flex:0 0 auto;align-self:flex-start;color:color-mix(in srgb,currentColor 55%,transparent);font-size:11px}
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

export class ChatSearchController {
    constructor({ surface, adapter, documentObject = surface?.ownerDocument || globalThis.document, historyAdapterFactory, locatorFactory, debounceMs = 400, maxChannels = 10, maxPagesPerChannel = 5, pageSize = 100, MutationObserverClass = globalThis.MutationObserver } = {}) {
        this.surface = surface;
        this.adapter = adapter;
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.historyAdapterFactory = historyAdapterFactory || ((channel) => new ChatHistoryAdapter({ channel }));
        this.locatorFactory = locatorFactory || (() => new ChatSearchLocator({ surface, documentObject }));
        this.locator = this.locatorFactory();
        this.debounceMs = debounceMs;
        this.maxChannels = maxChannels;
        this.maxPagesPerChannel = maxPagesPerChannel;
        this.pageSize = pageSize;
        this.root = null;
        this.listHost = null;
        this.input = null;
        this.statusNode = null;
        this.listNode = null;
        this.debounceTimer = null;
        this.operation = 0;
        this.mounted = false;
        this.onInput = () => this.#schedule();
        this.onKeydown = (event) => { if (event.key === 'Enter') { event.preventDefault?.(); this.#runNow(); } };
    }

    mount() {
        if (this.mounted || !this.documentObject?.createElement) return false;
        this.listHost = this.#findListHost();
        if (!this.listHost) return false;
        this.mounted = true;
        this.root = make(this.documentObject, 'div', 'vgen-nya-chat-search notranslate');
        this.root.dataset.vgenNyaUi = 'chat-search';
        this.root.translate = false;
        const bar = make(this.documentObject, 'div', 'vgen-nya-chat-search__bar');
        this.input = make(this.documentObject, 'input', '');
        this.input.type = 'text';
        this.input.placeholder = '搜索聊天记录…';
        this.input.setAttribute('aria-label', '搜索所有聊天记录');
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
        if (typeof this.listHost.prepend === 'function') this.listHost.prepend(this.root);
        else if (typeof this.listHost.insertBefore === 'function' && this.listHost.firstChild) this.listHost.insertBefore(this.root, this.listHost.firstChild);
        else this.listHost.append?.(this.root);
        return true;
    }

    #findListHost() {
        const roots = this.documentObject?.querySelectorAll?.(LIST_SELECTOR) || [];
        let best = null;
        let bestScore = -1;
        for (const root of roots) {
            const previews = root.querySelectorAll?.(PREVIEW_SELECTOR)?.length || 0;
            if (previews > bestScore) { bestScore = previews; best = root; }
        }
        return best;
    }

    ownsMutation(record) {
        return Boolean(this.root && (record?.target === this.root || this.root.contains?.(record?.target)));
    }

    refresh() {}

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
            this.#render([], null);
            return;
        }
        this.#setStatus('搜索中…', false);
        this.#render([], null);
        try {
            const channels = (await this.adapter.listChannels?.()) || [];
            const selfId = String(this.adapter.selfId?.() || '');
            const results = await searchAllChannels(normalized, channels.slice(0, this.maxChannels), {
                historyAdapterFactory: this.historyAdapterFactory,
                selfId,
                maxPages: this.maxPagesPerChannel,
                pageSize: this.pageSize,
                signal: undefined,
                isStale: () => operation !== this.operation,
            });
            if (operation !== this.operation) return;
            this.#render(results, normalized);
        } catch (error) {
            if (operation !== this.operation) return;
            this.#setStatus(`搜索失败：${error?.message || '未知错误'}`, true);
        }
    }

    #render(results, query) {
        this.listNode.replaceChildren();
        const documentObject = this.documentObject;
        for (const message of results) {
            const button = make(documentObject, 'button', 'vgen-nya-chat-search__result');
            button.type = 'button';
            button.dataset.action = 'open';
            button.dataset.messageId = message.messageId;
            button.dataset.userId = message.channel?.userId || '';
            const avatar = make(documentObject, 'img', 'vgen-nya-chat-search__avatar');
            avatar.alt = '';
            avatar.src = message.channel?.avatar || '';
            const meta = make(documentObject, 'span', 'vgen-nya-chat-search__meta');
            meta.append(
                make(documentObject, 'span', 'vgen-nya-chat-search__name', message.channel?.displayName || message.channel?.username || message.authorName || ''),
                make(documentObject, 'span', 'vgen-nya-chat-search__id', message.channel?.username ? `@${message.channel.username}` : ''),
            );
            const snippet = make(documentObject, 'span', 'vgen-nya-chat-search__snippet', makeSnippet(message.text));
            snippet.translate = true;
            meta.append(snippet);
            const time = make(documentObject, 'span', 'vgen-nya-chat-search__time notranslate', message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');
            time.translate = false;
            button.append(avatar, meta, time);
            button.addEventListener('click', () => void this.#open(message));
            this.listNode.append(button);
        }
        if (query && results.length === 0) this.#setStatus('无结果', false);
        else if (query) this.#setStatus(`${results.length} 条结果`, false);
    }

    async #open(message) {
        const documentObject = this.documentObject;
        if (message.channel?.userId) {
            try {
                await this.adapter.constructor.openUser?.({ userID: message.channel.userId }, { documentObject, MutationObserverClass: this.MutationObserverClass });
            } catch {
                // Opening the conversation failed; the native surface stays as-is.
            }
        }
        const history = this.historyAdapterFactory(this.adapter.findChannel?.());
        await this.locator.locateOrLoad(message.messageId, { load: (id) => history.loadAround(id) });
    }

    #setStatus(text, error) {
        if (!this.statusNode) return;
        this.statusNode.textContent = text;
        this.statusNode.dataset.error = error ? 'true' : 'false';
    }

    unmount() {
        if (!this.mounted) return false;
        this.mounted = false;
        this.operation += 1;
        if (this.debounceTimer !== null) globalThis.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        this.locator.clearHighlights();
        this.input?.removeEventListener('input', this.onInput);
        this.input?.removeEventListener('keydown', this.onKeydown);
        this.root?.remove();
        this.root = null;
        this.input = null;
        this.statusNode = null;
        this.listNode = null;
        this.listHost = null;
        return true;
    }
}
