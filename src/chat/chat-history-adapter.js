// ChatHistoryAdapter resolves history-message reads for the active Stream Chat
// conversation without depending on any write operation. It normalizes whatever
// the SDK returns into a minimal, search-only shape and never calls send/markRead/
// reaction/update.

export function normalizeChatMessage(message, cid) {
    if (!message || typeof message !== 'object') return null;
    const id = message.id || message.messageId || message.message_id;
    if (!id) return null;
    const createdAt = message.created_at || message.createdAt || message.created || null;
    return {
        messageId: String(id),
        cid: cid || null,
        authorId: message.user?.id || message.user_id || message.senderId || null,
        authorName: message.user?.name || message.user?.username || null,
        text: typeof message.text === 'string' ? message.text : (typeof message.body === 'string' ? message.body : ''),
        createdAt: createdAt == null ? null : (createdAt instanceof Date ? createdAt.toISOString() : String(createdAt)),
    };
}

function channelCid(channel) {
    return channel?.cid || (channel?.type && channel?.id ? `${channel.type}:${channel.id}` : null);
}

export class ChatHistoryAdapter {
    constructor({ channel, client, fetchImpl = globalThis.fetch } = {}) {
        this.channel = channel || null;
        this.client = client || channel?.getClient?.() || channel?.client || channel?._client || null;
        this.fetchImpl = fetchImpl;
    }

    cid() {
        return channelCid(this.channel);
    }

    // Already-loaded messages from the SDK channel state. Always read-only.
    loadedMessages() {
        const list = this.channel?.state?.messages || this.channel?.state?.messagePagination?.messages || [];
        return list.map((message) => normalizeChatMessage(message, this.cid())).filter(Boolean);
    }

    supportsServerSearch() {
        return typeof this.channel?.search === 'function' || typeof this.client?.search === 'function';
    }

    // Server-side search when the SDK exposes it. Returns normalized messages or
    // null when the path is unavailable so the caller can fall back to pagination.
    async searchServer(query, { signal } = {}) {
        const cid = this.cid();
        try {
            if (typeof this.channel?.search === 'function') {
                const response = await this.channel.search({ query, text: query }, { limit: 50 }, { signal });
                return this.#messagesFromSearchResponse(response, cid);
            }
            if (typeof this.client?.search === 'function') {
                const response = await this.client.search({ query }, { cid }, { limit: 50 }, { signal });
                return this.#messagesFromSearchResponse(response, cid);
            }
        } catch {
            return null;
        }
        return null;
    }

    #messagesFromSearchResponse(response, cid) {
        const results = response?.results || [];
        const messages = results.map((item) => item?.message || item).filter(Boolean);
        const normalized = messages.map((message) => normalizeChatMessage(message, cid)).filter(Boolean);
        return normalized.length ? normalized : null;
    }

    // Fetches one page of history. The SDK returns pages in ascending (oldest
    // first) order; `before` is the id of the oldest message seen so far and is
    // passed as id_lt. Returns { available, messages, hasMore }.
    async fetchHistoryPage({ before = null, limit = 100, signal } = {}) {
        const channel = this.channel;
        if (!channel) return { available: false, messages: [], hasMore: false };
        if (typeof channel.query !== 'function') return { available: false, messages: [], hasMore: false };
        try {
            const messageQuery = before ? { limit, id_lt: before } : { limit };
            const response = await channel.query({ messages: messageQuery }, { signal });
            const list = Array.isArray(response?.messages)
                ? response.messages
                : Array.isArray(response) ? response : null;
            if (!Array.isArray(list)) return { available: false, messages: [], hasMore: false };
            const messages = list.map((message) => normalizeChatMessage(message, this.cid())).filter(Boolean);
            const hasMore = messages.length >= limit;
            return { available: true, messages, hasMore };
        } catch {
            return { available: false, messages: [], hasMore: false };
        }
    }

    // Loads the region around a single message id into the channel state so a
    // not-yet-rendered result can be resolved. Returns whether the target id is
    // now present in the SDK state (it may still not be mounted in the DOM, which
    // is the caller's responsibility to report honestly).
    async loadAround(messageId, { limit = 50, signal } = {}) {
        const channel = this.channel;
        const target = String(messageId || '');
        if (!channel || !target || typeof channel.query !== 'function') return { loaded: false };
        try {
            await channel.query({ messages: { limit, id_around: target } }, { signal });
            const present = (channel.state?.messages || []).some((message) => String(message?.id) === target);
            return { loaded: present };
        } catch {
            return { loaded: false };
        }
    }
}
