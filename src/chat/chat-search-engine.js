// ChatSearchEngine orchestrates a user-triggered keyword search over the active
// conversation. It is the only thing that fetches history (never on open, never
// in the background). Every async path is guarded by an operation token so a
// stale result can never overwrite the latest query, channel, or session.

export const SEARCH_STATES = Object.freeze({
    idle: 'idle',
    searching: 'searching',
    results: 'results',
    empty: 'empty',
    error: 'error',
});

export const SEARCH_SOURCES = Object.freeze({
    server: 'server',
    history: 'history',
    loaded: 'loaded',
});

export function normalizeSearchText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function matchesQuery(text, query) {
    const needle = normalizeSearchText(query).toLowerCase();
    if (!needle) return false;
    return normalizeSearchText(text).toLowerCase().includes(needle);
}

export function makeSnippet(text, maximum = 160) {
    const plain = normalizeSearchText(text);
    return plain.length > maximum ? `${plain.slice(0, maximum)}…` : plain;
}

const DEFAULT_MAX_CHANNELS = 5;
const DEFAULT_MAX_MESSAGES_PER_CHANNEL = 500;

// Bounded per-channel cache of already-fetched history pages. It only grows by
// explicit search, reuses pages across queries, and evicts least-recently-used
// channels so it never becomes an unbounded chat database.
export class ChatSearchCache {
    constructor({ maxChannels = DEFAULT_MAX_CHANNELS, maxMessages = DEFAULT_MAX_MESSAGES_PER_CHANNEL } = {}) {
        this.maxChannels = maxChannels;
        this.maxMessages = maxMessages;
        this.channels = new Map(); // cid -> { messages: [], ids: Set, complete }
    }

    get(cid) {
        const entry = this.channels.get(cid);
        if (!entry) return null;
        this.channels.delete(cid);
        this.channels.set(cid, entry); // refresh LRU order
        return entry;
    }

    // Merges a fetched page into the channel entry and returns the entry. Pages
    // append older messages after newer ones, so entry.messages stays newest-first.
    record(cid, messages, { complete = false } = {}) {
        const entry = this.get(cid) || { messages: [], ids: new Set(), complete: false };
        for (const message of messages) {
            if (!message?.messageId || entry.ids.has(message.messageId)) continue;
            entry.ids.add(message.messageId);
            entry.messages.push(message);
        }
        entry.complete = Boolean(entry.complete || complete);
        if (entry.messages.length > this.maxMessages) {
            const overflow = entry.messages.length - this.maxMessages;
            const dropped = entry.messages.splice(0, overflow);
            for (const message of dropped) entry.ids.delete(message.messageId);
            entry.complete = false; // dropped oldest messages; history is no longer complete
        }
        this.channels.delete(cid);
        this.channels.set(cid, entry);
        while (this.channels.size > this.maxChannels) {
            const oldestCid = this.channels.keys().next().value;
            this.channels.delete(oldestCid);
        }
        return entry;
    }

    oldestId(entry) {
        const messages = entry?.messages || [];
        return messages.length ? messages[messages.length - 1].messageId : null;
    }

    clear() {
        this.channels.clear();
    }

    get size() {
        return this.channels.size;
    }
}

export class ChatSearchEngine {
    constructor({ cache = new ChatSearchCache(), maxPagesPerSearch = 5, pageSize = 100 } = {}) {
        this.cache = cache;
        this.maxPagesPerSearch = maxPagesPerSearch;
        this.pageSize = pageSize;
        this.operation = 0;
        this.listeners = new Set();
        this.state = SEARCH_STATES.idle;
        this.results = [];
        this.source = null;
        this.partial = false;
        this.error = null;
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    get snapshot() {
        return { state: this.state, results: this.results, source: this.source, partial: this.partial, error: this.error };
    }

    cancel(reason = 'superseded') {
        this.operation += 1;
    }

    async search({ query, history, cid }) {
        const operation = ++this.operation;
        const normalized = normalizeSearchText(query);
        if (!normalized) {
            this.#set({ state: SEARCH_STATES.idle, results: [], source: null, partial: false, error: null });
            return this.snapshot;
        }
        this.#set({ state: SEARCH_STATES.searching, results: [], source: null, partial: false, error: null });
        try {
            // 1. Server-side search when the SDK exposes it.
            if (history?.supportsServerSearch?.()) {
                const server = await history.searchServer(normalized);
                if (operation !== this.operation) return this.snapshot;
                if (server && server.length) {
                    this.#set({ state: SEARCH_STATES.results, results: server, source: SEARCH_SOURCES.server, partial: false, error: null });
                    return this.snapshot;
                }
            }
            // 2. Paginated history + local match.
            const result = await this.#searchHistory(normalized, history, cid, operation);
            if (operation !== this.operation) return this.snapshot;
            this.#set(result);
            return this.snapshot;
        } catch (error) {
            if (operation !== this.operation) return this.snapshot;
            this.#set({ state: SEARCH_STATES.error, results: [], source: null, partial: false, error: String(error?.message || error) });
            return this.snapshot;
        }
    }

    async #searchHistory(normalized, history, cid, operation) {
        let entry = this.cache.get(cid) || this.cache.record(cid, [], { complete: false });
        let pagesFetched = 0;
        let available = true;
        while (!entry.complete && pagesFetched < this.maxPagesPerSearch && available) {
            const before = this.cache.oldestId(entry);
            const page = await history.fetchHistoryPage({ before, limit: this.pageSize });
            if (operation !== this.operation) return this.snapshot;
            if (!page?.available) { available = false; break; }
            const messages = page.messages || [];
            if (!messages.length) { entry = this.cache.record(cid, [], { complete: true }); break; }
            const complete = messages.length < this.pageSize;
            entry = this.cache.record(cid, messages, { complete });
            pagesFetched += 1;
        }
        const { messages } = entry;
        const matches = messages.filter((message) => matchesQuery(message.text, normalized));
        const partial = !entry.complete && available === true;
        const source = available ? SEARCH_SOURCES.history : SEARCH_SOURCES.loaded;
        if (!available) {
            // Pagination unavailable: fall back to already-loaded SDK messages.
            const loaded = history.loadedMessages?.() || [];
            const loadedMatches = loaded.filter((message) => matchesQuery(message.text, normalized));
            return {
                state: loadedMatches.length ? SEARCH_STATES.results : SEARCH_STATES.empty,
                results: loadedMatches,
                source: SEARCH_SOURCES.loaded,
                partial: true,
                error: null,
            };
        }
        return {
            state: matches.length ? SEARCH_STATES.results : SEARCH_STATES.empty,
            results: matches,
            source,
            partial,
            error: null,
        };
    }

    #set({ state, results, source, partial, error }) {
        this.state = state;
        this.results = results;
        this.source = source;
        this.partial = partial;
        this.error = error;
        for (const listener of this.listeners) listener(this.snapshot);
    }
}
