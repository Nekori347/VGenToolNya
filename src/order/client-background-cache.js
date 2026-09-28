import { REVIEW_SOURCE_STATES } from './client-review-adapter.js';

export const CLIENT_BACKGROUND_TTL_MS = 6 * 60 * 60 * 1000;
export const CLIENT_BACKGROUND_ERROR_TTL_MS = 2 * 60 * 1000;
export const CLIENT_BACKGROUND_UNAVAILABLE_TTL_MS = 15 * 60 * 1000;

const ttlFor = (state) => state === REVIEW_SOURCE_STATES.error
    ? CLIENT_BACKGROUND_ERROR_TTL_MS
    : state === REVIEW_SOURCE_STATES.unavailable
        ? CLIENT_BACKGROUND_UNAVAILABLE_TTL_MS
        : CLIENT_BACKGROUND_TTL_MS;

export class ClientBackgroundCache {
    constructor({ now = () => Date.now() } = {}) {
        this.now = now;
        this.entries = new Map();
        this.pending = new Map();
    }

    key(identity) {
        return String(identity?.clientId || identity?.handle || '').trim().toLowerCase();
    }

    peek(identity) {
        const key = this.key(identity);
        const entry = this.entries.get(key);
        if (!entry || this.now() - entry.fetchedAt >= ttlFor(entry.state)) {
            if (entry) this.entries.delete(key);
            return null;
        }
        return { ...entry, fromCache: true };
    }

    async load(identity, loader) {
        const key = this.key(identity);
        if (!key) return {
            state: REVIEW_SOURCE_STATES.unavailable,
            clientId: '', profileUrl: '', reviews: [], negativeReviews: [], fetchedAt: this.now(), fromCache: false,
        };
        const cached = this.peek(identity);
        if (cached) return cached;
        if (this.pending.has(key)) return this.pending.get(key);
        const operation = (async () => {
            try {
                const result = await loader();
                const entry = { ...result, fetchedAt: this.now(), fromCache: false };
                this.entries.set(key, entry);
                return { ...entry };
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                const entry = {
                    state: REVIEW_SOURCE_STATES.error,
                    clientId: identity.clientId,
                    profileUrl: identity.profileUrl,
                    reviews: [], negativeReviews: [],
                    fetchedAt: this.now(), fromCache: false,
                    error: String(error?.message || 'Public review request failed'),
                };
                this.entries.set(key, entry);
                return { ...entry };
            } finally {
                this.pending.delete(key);
            }
        })();
        this.pending.set(key, operation);
        return operation;
    }

    clear() {
        this.entries.clear();
        this.pending.clear();
    }
}
