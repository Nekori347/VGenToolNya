import { REVIEW_SOURCE_STATES } from './client-review-adapter.js';

// Stable, minimal export contract for a future exporter (Feishu). Only fields
// that already exist in the Order Assistant's normalized identity / review
// context are exported. DOM nodes, internal ids, auth data and chat history
// are intentionally excluded by whitelist.
export const ORDER_EXPORT_SCHEMA_VERSION = 1;

const REVIEW_STATES = new Set(Object.values(REVIEW_SOURCE_STATES));

function stringValue(value) {
    return typeof value === 'string' ? value : '';
}

function optionalString(value) {
    return typeof value === 'string' && value ? value : null;
}

function optionalNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function optionalBoolean(value) {
    return typeof value === 'boolean' ? value : null;
}

// identity comes from resolvePublicClientIdentity and may carry a DOM
// mountTarget plus other live objects. Only the three public string fields are
// kept; nothing else can leak into the export.
export function normalizeOrderClient(identity) {
    if (!identity || typeof identity !== 'object') return { clientId: '', handle: '', profileUrl: '' };
    return {
        clientId: stringValue(identity.clientId),
        handle: stringValue(identity.handle),
        profileUrl: stringValue(identity.profileUrl),
    };
}

function reviewNegative(review) {
    if (typeof review.negative === 'boolean') return review.negative;
    if (typeof review.wouldRecommend === 'boolean') return !review.wouldRecommend;
    const rating = Number(review.rating);
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) return rating < 5;
    return false;
}

export function normalizeOrderReview(review) {
    if (!review || typeof review !== 'object') return null;
    const body = stringValue(review.body);
    if (!body) return null;
    return {
        body,
        negative: reviewNegative(review),
        rating: optionalNumber(review.rating),
        wouldRecommend: optionalBoolean(review.wouldRecommend),
        reviewer: optionalString(review.reviewer),
        date: optionalString(review.date),
        context: optionalString(review.context),
    };
}

// NormalizedOrder: a plain, JSON-safe object a future exporter can consume.
export function normalizeOrder(identity, reviewContext) {
    const source = reviewContext && typeof reviewContext === 'object' ? reviewContext : {};
    const reviews = Array.isArray(source.reviews)
        ? source.reviews.map(normalizeOrderReview).filter(Boolean)
        : [];
    const negativeCount = Number.isFinite(Number(source.negativeCount))
        ? Number(source.negativeCount)
        : reviews.filter((review) => review.negative).length;
    return {
        schemaVersion: ORDER_EXPORT_SCHEMA_VERSION,
        client: normalizeOrderClient(identity),
        review: {
            state: REVIEW_STATES.has(source.state) ? source.state : '',
            reviews,
            negativeCount,
            fetchedAt: optionalNumber(source.fetchedAt),
        },
    };
}

export class ExportAdapter {
    normalize(identity, reviewContext) {
        return normalizeOrder(identity, reviewContext);
    }

    // JSON round-trip guarantees the result is a plain object with no DOM
    // nodes, functions or circular references, and is JSON.stringify-able.
    toJSON(order) {
        return JSON.parse(JSON.stringify(order ?? null));
    }

    serialize(order) {
        return JSON.stringify(this.toJSON(order));
    }
}
