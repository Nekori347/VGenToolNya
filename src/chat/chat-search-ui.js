import { ChatHistoryAdapter } from './chat-history-adapter.js';
import { ChatSearchCache, ChatSearchEngine, SEARCH_STATES, makeSnippet } from './chat-search-engine.js';
import { ChatSearchLocator } from './chat-search-locator.js';

export const CHAT_SEARCH_CSS = `
.vgen-nya-chat-search{margin:0;padding:6px 8px;border-bottom:1px solid color-mix(in srgb,currentColor 16%,transparent);display:flex;flex-direction:column;gap:6px;font:12px/1.4 system-ui,sans-serif;color:inherit;max-width:100%}
.vgen-nya-chat-search__bar{display:flex;align-items:center;gap:6px}
.vgen-nya-chat-search input{flex:1;min-width:0;padding:5px 8px;border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;background:Canvas;color:CanvasText;font:inherit}
.vgen-nya-chat-search button{border:1px solid color-mix(in srgb,currentColor 24%,transparent);border-radius:7px;padding:5px 9px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit;font:inherit;cursor:pointer}
.vgen-nya-chat-search button:hover{background:color-mix(in srgb,currentColor 14%,transparent)}
.vgen-nya-chat-search button:disabled{opacity:.5;cursor:default}
.vgen-nya-chat-search__status{margin:0;opacity:.75}
.vgen-nya-chat-search__status[data-error="true"]{color:#b42318}
.vgen-nya-chat-search__results{list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:220px;overflow:auto}
.vgen-nya-chat-search__result{display:block;width:100%;text-align:left;padding:6px 8px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;cursor:pointer}
.vgen-nya-chat-search__result-snippet{display:block;white-space:pre-wrap;overflow-wrap:anywhere}
.vgen-nya-chat-search__result-meta{display:block;margin-top:3px;font-size:11px;opacity:.72}
`;

function make(documentObject, tagName, className = '', text = '') {
    const node = documentObject.createElement(tagName);
    node.className = className;
    node.textContent = text;
    return node;
}

function mountAtTop(surface, node) {
    if (typeof surface?.prepend === 'function') surface.prepend(node);
    else if (typeof surface?.insertBefore === 'function' && surface.firstChild) surface.insertBefore(node, surface.firstChild);
    else surface?.append?.(node);
}

export class ChatSearchController {
    constructor({ surface, adapter, documentObject = surface?.ownerDocument || globalThis.document, historyAdapterFactory, locatorFactory, debounceMs = 300 } = {}) {
        this.surface = surface;
        this.adapter = adapter;
        this.documentObject = documentObject;
        this.historyAdapterFactory = historyAdapterFactory || ((channel) => new ChatHistoryAdapter({ channel }));
        this.locatorFactory = locatorFactory || (() => new ChatSearchLocator({ surface, documentObject }));
        this.debounceMs = debounceMs;
        this.engine = new ChatSearchEngine({ cache: new ChatSearchCache() });
        this.locator = this.locatorFactory();
        this.cid = null;
        this.root = null;
        this.input = null;
        this.statusNode = null;
        this.listNode = null;
        this.debounceTimer = null;
        this.mounted = false;
        this.unsubscribe = this.engine.subscribe(() => this.#renderResults());
        this.onInput = () => this.#scheduleSearch();
        this.onKeydown = (event) => { if (event.key === 'Enter') { event.preventDefault?.(); this.#runNow(); } };
    }

    mount() {
        if (this.mounted || !this.documentObject?.createElement) return false;
        this.mounted = true;
        this.root = make(this.documentObject, 'div', 'vgen-nya-chat-search notranslate');
        this.root.dataset.vgenNyaUi = 'chat-search';
        this.root.translate = false;
        this.#build();
        mountAtTop(this.surface, this.root);
        this.refresh();
        return true;
    }

    #build() {
        const documentObject = this.documentObject;
        const bar = make(documentObject, 'div', 'vgen-nya-chat-search__bar');
        this.input = make(documentObject, 'input', '');
        this.input.type = 'text';
        this.input.placeholder = '搜索当前会话…';
        this.input.setAttribute('aria-label', '搜索聊天历史');
        this.input.addEventListener('input', this.onInput);
        this.input.addEventListener('keydown', this.onKeydown);
        const run = make(documentObject, 'button', 'notranslate', '搜索');
        run.type = 'button';
        run.translate = false;
        run.dataset.action = 'search';
        run.addEventListener('click', () => void this.#runNow());
        bar.append(this.input, run);
        this.statusNode = make(documentObject, 'p', 'vgen-nya-chat-search__status notranslate');
        this.statusNode.translate = false;
        this.listNode = make(documentObject, 'ul', 'vgen-nya-chat-search__results');
        this.root.append(bar, this.statusNode, this.listNode);
    }

    ownsMutation(record) {
        return Boolean(this.root && (record?.target === this.root || this.root.contains?.(record?.target)));
    }

    refresh() {
        const channel = this.adapter?.findChannel?.();
        const cid = channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null) || null;
        if (cid !== this.cid) {
            this.cid = cid;
            this.engine.cancel('channel-change');
            if (this.input) this.input.value = '';
            this.#renderResults();
        }
    }

    #channel() {
        return this.adapter?.findChannel?.() || null;
    }

    #historyAdapter() {
        return this.historyAdapterFactory(this.#channel());
    }

    #scheduleSearch() {
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
        const channel = this.#channel();
        const cid = channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null);
        if (!cid || !channel) {
            this.#setStatus('无法读取当前会话', true);
            return;
        }
        await this.engine.search({ query, history: this.#historyAdapter(), cid });
    }

    async #locate(messageId) {
        if (!messageId) return;
        const history = this.#historyAdapter();
        await this.locator.locateOrLoad(messageId, { load: (id) => history.loadAround(id) });
    }

    #renderResults() {
        const snapshot = this.engine.snapshot;
        if (!this.root) return;
        const documentObject = this.documentObject;
        this.listNode.replaceChildren();
        const resultNodes = [];
        for (const message of snapshot.results) {
            const button = make(documentObject, 'button', 'vgen-nya-chat-search__result');
            button.type = 'button';
            button.dataset.action = 'locate';
            button.dataset.messageId = message.messageId;
            const snippet = make(documentObject, 'span', 'vgen-nya-chat-search__result-snippet', makeSnippet(message.text));
            snippet.translate = true;
            const meta = make(documentObject, 'span', 'vgen-nya-chat-search__result-meta notranslate', this.#meta(message));
            meta.translate = false;
            button.append(snippet, meta);
            button.addEventListener('click', () => void this.#locate(message.messageId));
            resultNodes.push(button);
        }
        this.listNode.append(...resultNodes);
        if (snapshot.state === SEARCH_STATES.searching) this.#setStatus('搜索中…', false);
        else if (snapshot.state === SEARCH_STATES.error) this.#setStatus(`搜索失败：${snapshot.error || '未知错误'}`, true);
        else if (snapshot.state === SEARCH_STATES.results) this.#setStatus(`${snapshot.results.length} 条结果${snapshot.partial ? ' · 仅搜索已获取的部分历史' : ''}${snapshot.source === 'loaded' ? ' · 仅当前已加载消息' : ''}`, false);
        else if (snapshot.state === SEARCH_STATES.empty) this.#setStatus(snapshot.source === 'loaded' ? '无结果（仅当前已加载消息）' : '无结果', false);
        else this.#setStatus('', false);
    }

    #meta(message) {
        const author = message.authorName || message.authorId || '';
        const time = message.createdAt ? new Date(message.createdAt).toLocaleString?.() || message.createdAt : '';
        return [author, time].filter(Boolean).join(' · ');
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
        this.unsubscribe?.();
        this.unsubscribe = null;
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
}
