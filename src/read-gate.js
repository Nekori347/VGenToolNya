function parseJSON(value) {
    if (!value) return null;
    if (typeof value === 'object' && !(value instanceof ArrayBuffer)) return value;
    try { return JSON.parse(String(value)); } catch { return null; }
}

export function channelIdFromURL(value, base = 'https://vgen.co/') {
    try {
        const pathname = new URL(String(value || ''), base).pathname;
        const match = pathname.match(/\/channels\/([^/]+)\/([^/]+)(?:\/|$)/i);
        return match ? `${decodeURIComponent(match[1])}:${decodeURIComponent(match[2])}` : null;
    } catch { return null; }
}

export function classifyStreamRequest(method, value, base = 'https://vgen.co/') {
    try {
        const parsed = new URL(String(value || ''), base);
        if (!/(^|\.)stream-io-api\.com$/i.test(parsed.hostname)) return { kind: 'other', cid: null };
        const upper = String(method || 'GET').toUpperCase();
        const cid = channelIdFromURL(parsed.href, base);
        if (upper === 'POST' && /\/channels\/(?:[^/]+\/[^/]+\/read|read)$/i.test(parsed.pathname)) return { kind: 'read', cid };
        if (upper === 'POST' && /\/channels\/[^/]+\/[^/]+\/message$/i.test(parsed.pathname)) return { kind: 'message', cid };
        const reaction = parsed.pathname.match(/\/messages\/([^/]+)\/reaction(?:\/[^/]+)?$/i);
        if (reaction && /^(POST|DELETE)$/.test(upper)) return { kind: 'reaction', cid, messageId: decodeURIComponent(reaction[1]) };
        return { kind: 'other', cid };
    } catch { return { kind: 'other', cid: null }; }
}

export class ReadGate {
    constructor({ enabled = false, reactionMarkRead = false } = {}) {
        this.enabled = Boolean(enabled);
        this.reactionMarkRead = Boolean(reactionMarkRead);
        this.latest = new Map();
        this.pending = new Map();
        this.manualPermits = new Map();
        this.replyBoundaries = new Map();
        this.confirmations = new Set();
    }

    configure({ enabled = this.enabled, reactionMarkRead = this.reactionMarkRead } = {}) {
        const wasEnabled = this.enabled;
        this.enabled = Boolean(enabled);
        this.reactionMarkRead = Boolean(reactionMarkRead);
        if (wasEnabled && !this.enabled) this.cancelAll('read-control-disabled');
    }

    channelForMessage(messageId) {
        const wanted = String(messageId || '');
        if (!wanted) return null;
        for (const [cid, message] of this.latest) if (message.id === wanted) return cid;
        return null;
    }

    observeLatest(cid, message) {
        if (!cid || !message?.id) return;
        const current = this.latest.get(cid);
        this.latest.set(cid, { id: String(message.id), createdAt: message.created_at || message.createdAt || null, senderId: message.user?.id || message.senderId || null });
        if (current?.id && current.id !== message.id) this.replyBoundaries.delete(cid);
    }

    // Whether the latest message of a channel is still being held unread by the
    // gate (an intercepted read request or a not-yet-consumed manual permit).
    // Used by the display layer so an incoming message that the gate keeps
    // unread never renders as read.
    isHeldUnread(cid, messageId) {
        if (!this.enabled || !cid || messageId == null) return false;
        const latest = this.latest.get(cid);
        if (!latest || latest.id !== String(messageId)) return false;
        const pending = (this.pending.get(cid) || []).length > 0;
        return pending || this.manualPermits.has(cid);
    }

    interceptRead({ cid, body, perform, cancel }) {
        if (!this.enabled || !cid) return perform('native');
        const requestedId = parseJSON(body)?.message_id;
        const latest = this.latest.get(cid);
        const manual = this.manualPermits.get(cid);
        if (manual && latest?.id === manual.targetId && (!requestedId || requestedId === manual.targetId)) {
            this.manualPermits.delete(cid);
            return perform(manual.reason);
        }
        const reply = this.replyBoundaries.get(cid);
        if (reply && latest?.id === reply.targetId && (!requestedId || requestedId === reply.targetId)) return perform('confirmed-reply-boundary');
        return new Promise((resolve, reject) => {
            const entry = {
                release: (reason) => Promise.resolve().then(() => perform(reason)).then(resolve, reject),
                cancel: (reason) => {
                    cancel?.(reason);
                    const error = new Error(`Read request cancelled: ${reason}`);
                    error.name = 'AbortError';
                    reject(error);
                },
            };
            const entries = this.pending.get(cid) || [];
            if (entries.length >= 4) entries.shift().cancel('superseded');
            entries.push(entry);
            this.pending.set(cid, entries);
        });
    }

    manualRelease(cid, nativeMarkRead) {
        const target = this.latest.get(cid);
        if (!this.enabled || !cid || !target?.id || this.confirmations.has(cid)) return { released: 0, reason: 'boundary-unavailable' };
        this.confirmations.add(cid);
        const entries = this.pending.get(cid) || [];
        this.pending.delete(cid);
        if (entries.length) {
            entries.forEach((entry) => entry.release('manual-click'));
            return { released: entries.length };
        }
        this.manualPermits.set(cid, { targetId: target.id, reason: 'manual-click' });
        return { released: 0, operation: nativeMarkRead?.({ message_id: target.id }) };
    }

    confirmServerRead(cid) {
        this.confirmations.delete(cid);
        this.manualPermits.delete(cid);
    }

    confirmReply(cid, message) {
        if (!this.enabled || !cid || !message?.id) return 0;
        this.observeLatest(cid, message);
        this.replyBoundaries.set(cid, { targetId: String(message.id), createdAt: message.created_at || null });
        return this.#release(cid, 'confirmed-reply-boundary');
    }

    confirmReaction(cid, boundaryId) {
        if (!this.enabled || !this.reactionMarkRead || this.latest.get(cid)?.id !== boundaryId) return 0;
        return this.#release(cid, 'confirmed-reaction');
    }

    cancelAll(reason = 'cleanup') {
        for (const entries of this.pending.values()) entries.forEach((entry) => entry.cancel(reason));
        this.pending.clear();
        this.manualPermits.clear();
        this.replyBoundaries.clear();
        this.confirmations.clear();
    }

    #release(cid, reason) {
        const entries = this.pending.get(cid) || [];
        this.pending.delete(cid);
        entries.forEach((entry) => entry.release(reason));
        return entries.length;
    }
}
