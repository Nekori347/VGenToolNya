import { isReviewProviderConfigured } from './review-config.js';
import { normalizeReviewCandidate } from './review-candidate.js';

export const REVIEW_SESSION_STATES = Object.freeze({
    idle: 'idle',
    generating: 'generating',
    ready: 'ready',
    error: 'error',
});

const MAX_DEDUPE_RETRIES = 1;

// A ReviewSession owns one real review surface open/close cycle. It enforces
// the generation lock, at-most-one auto-generation per session, bounded
// duplicate avoidance, and stale-response protection after dispose.
export class ReviewSession {
    constructor({ sessionId, adapter, history, providerRepository, AbortControllerClass = globalThis.AbortController, now = () => Date.now() } = {}) {
        this.sessionId = sessionId;
        this.adapter = adapter;
        this.history = history;
        this.providerRepository = providerRepository;
        this.AbortControllerClass = AbortControllerClass;
        this.now = now;
        this.state = REVIEW_SESSION_STATES.idle;
        this.candidate = null;
        this.error = null;
        this.lock = false;
        this.generated = false;
        this.operation = 0;
        this.abortController = null;
        this.listeners = new Set();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    get snapshot() {
        return {
            sessionId: this.sessionId,
            state: this.state,
            candidate: this.candidate,
            error: this.error,
            generated: this.generated,
            generating: this.lock,
        };
    }

    isGenerating() {
        return this.lock;
    }

    async generate({ keywords = [], length = 'Medium', starDegree = 3 } = {}) {
        if (this.lock) return false;
        const config = this.providerRepository.read().provider;
        if (!isReviewProviderConfigured(config)) {
            this.state = REVIEW_SESSION_STATES.error;
            this.error = { code: 'PROVIDER_NOT_CONFIGURED', message: 'Provider not configured' };
            this.#emit();
            return false;
        }
        this.lock = true;
        this.state = REVIEW_SESSION_STATES.generating;
        this.error = null;
        this.#emit();
        const operation = ++this.operation;
        const controller = this.AbortControllerClass ? new this.AbortControllerClass() : null;
        this.abortController = controller;
        try {
            let result = await this.adapter.generate({ config, keywords, length, starDegree, signal: controller?.signal });
            if (operation !== this.operation) return false;
            for (let attempt = 0; attempt < MAX_DEDUPE_RETRIES && this.history.has(result.english); attempt += 1) {
                result = await this.adapter.generate({ config, keywords, length, starDegree, distinctFromRecent: true, signal: controller?.signal });
                if (operation !== this.operation) return false;
            }
            const candidate = normalizeReviewCandidate({
                ...result,
                keywords,
                length,
                starDegree,
                generatedAt: this.now(),
                duplicate: this.history.has(result.english),
            });
            if (!candidate) throw Object.assign(new Error('Provider produced an empty review'), { code: 'MALFORMED_OUTPUT' });
            this.history.record(candidate.english);
            this.candidate = candidate;
            this.generated = true;
            this.state = REVIEW_SESSION_STATES.ready;
            this.#emit();
            return true;
        } catch (error) {
            if (operation !== this.operation) return false;
            // A failed regenerate keeps the previous candidate; only the error
            // status changes so the UI can offer another attempt. Release the
            // lock before emitting so the UI sees "error", not "generating".
            this.lock = false;
            this.abortController = null;
            this.state = REVIEW_SESSION_STATES.error;
            this.error = { code: error?.code || 'UNKNOWN', message: error?.message || String(error) };
            this.#emit();
            return false;
        } finally {
            if (operation === this.operation) {
                this.lock = false;
                this.abortController = null;
            }
        }
    }

    async regenerate(params = {}) {
        return this.generate(params);
    }

    dispose(reason = 'review-session-closed') {
        this.operation += 1;
        this.abortController?.abort(reason);
        this.abortController = null;
        this.lock = false;
        this.listeners.clear();
    }

    #emit() {
        const snapshot = this.snapshot;
        for (const listener of this.listeners) listener(snapshot);
    }
}
