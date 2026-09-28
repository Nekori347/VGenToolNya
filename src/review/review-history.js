import { reviewEnglishHash } from './review-candidate.js';

export const REVIEW_HISTORY_LIMIT = 12;

// Bounded in-memory history of recently generated English review hashes.
// Used only to avoid regenerating identical text; it is never persisted and
// never shared with the provider.
export class RecentReviewHistory {
    constructor({ limit = REVIEW_HISTORY_LIMIT } = {}) {
        this.limit = Math.max(1, Number(limit) || REVIEW_HISTORY_LIMIT);
        this.hashes = [];
    }

    has(english) {
        return this.hashes.includes(reviewEnglishHash(english));
    }

    record(english) {
        const hash = reviewEnglishHash(english);
        const existing = this.hashes.indexOf(hash);
        if (existing >= 0) this.hashes.splice(existing, 1);
        this.hashes.push(hash);
        if (this.hashes.length > this.limit) this.hashes.splice(0, this.hashes.length - this.limit);
        return hash;
    }

    clear() {
        this.hashes = [];
    }

    get size() {
        return this.hashes.length;
    }

    snapshot() {
        return [...this.hashes];
    }
}
