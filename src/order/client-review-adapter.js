const RESERVED_HANDLES = new Set([
    '', 'about', 'artists', 'authorize', 'cart', 'catalogue', 'category', 'challenge',
    'commission', 'creator', 'export', 'for-artists', 'login', 'messages', 'profile',
    'reviews', 'settings', 'signup', 'support',
]);

export const REVIEW_SOURCE_STATES = Object.freeze({
    success: 'SUCCESS',
    empty: 'EMPTY',
    error: 'ERROR',
    unavailable: 'UNAVAILABLE',
});

function compact(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizePublicHandle(value) {
    const handle = compact(value).replace(/^@/, '');
    if (!/^[A-Za-z0-9_-]+$/.test(handle) || RESERVED_HANDLES.has(handle.toLowerCase())) return '';
    return handle;
}

export function canonicalProfileUrl(handle) {
    const normalized = normalizePublicHandle(handle);
    return normalized ? `https://vgen.co/${encodeURIComponent(normalized)}` : '';
}

function handleFromHref(href, baseUrl = 'https://vgen.co/') {
    try {
        const url = new URL(href, baseUrl);
        if (url.origin !== 'https://vgen.co') return '';
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length !== 1) return '';
        return normalizePublicHandle(decodeURIComponent(parts[0]));
    } catch {
        return '';
    }
}

export function resolvePublicClientIdentity(panel) {
    if (!panel?.querySelectorAll) return null;
    for (const anchor of panel.querySelectorAll('a[href]')) {
        const href = anchor.href || anchor.getAttribute?.('href') || '';
        const handle = handleFromHref(href, panel.ownerDocument?.location?.href);
        if (!handle) continue;
        const label = compact(anchor.textContent);
        if (!label.startsWith('@') && !anchor.closest?.('[data-client], [class*="Client"], [class*="client"]')) continue;
        return {
            clientId: `@${handle}`,
            handle,
            profileUrl: canonicalProfileUrl(handle),
            mountTarget: anchor.closest?.('[data-client], [class*="Client"], [class*="client"]') || anchor.parentElement || panel,
        };
    }
    return null;
}

function pickText(value, names) {
    for (const name of names) {
        const text = compact(value?.[name]);
        if (text) return text;
    }
    return '';
}

export function normalizePublicReview(value) {
    const body = pickText(value, ['reviewText', 'body', 'text', 'review', 'comment', 'content', 'message']);
    if (!body) return null;
    const reviewer = pickText(value, ['reviewer', 'reviewerUsername', 'username', 'displayName']);
    const date = pickText(value, ['date', 'createdAt', 'created', 'submittedAt']);
    const context = pickText(value, ['service', 'serviceName', 'context', 'productName']);

    let negative = null;
    let rating = null;
    let wouldRecommend = null;
    const recommend = value?.wouldRecommend ?? value?.recommend ?? value?.would_recommend;
    if (typeof recommend === 'boolean') {
        wouldRecommend = recommend;
        negative = !recommend;
    } else {
        rating = Number(value?.rating ?? value?.score ?? value?.stars);
        if (Number.isFinite(rating) && rating >= 1 && rating <= 5) negative = rating < 5;
    }
    if (negative === null) return null;

    const review = { body, negative };
    if (rating !== null) review.rating = rating;
    if (wouldRecommend !== null) review.wouldRecommend = wouldRecommend;
    if (reviewer) review.reviewer = reviewer;
    if (date) review.date = date;
    if (context) review.context = context;
    return review;
}

function reviewCollections(root) {
    const found = [];
    const seen = new Set();
    const walk = (value, depth = 0) => {
        if (!value || typeof value !== 'object' || depth > 18 || seen.has(value)) return;
        seen.add(value);
        for (const [key, child] of Object.entries(value)) {
            if (/^(?:reviews?|reviewItems|feedback)$/i.test(key) && Array.isArray(child)) found.push(child);
            else walk(child, depth + 1);
        }
    };
    walk(root);
    return found;
}

export function normalizeReviewContext(raw, identity, now = Date.now()) {
    const collections = Array.isArray(raw) ? [raw] : reviewCollections(raw);
    if (!collections.length) return {
        state: REVIEW_SOURCE_STATES.unavailable,
        clientId: identity.clientId,
        profileUrl: identity.profileUrl,
        reviews: [], negativeReviews: [], fetchedAt: now,
    };
    const sourceItems = collections.flat();
    const reviews = sourceItems.map(normalizePublicReview).filter(Boolean);
    if (sourceItems.length && reviews.length !== sourceItems.length) return {
        state: REVIEW_SOURCE_STATES.unavailable,
        clientId: identity.clientId,
        profileUrl: identity.profileUrl,
        reviews: [], negativeReviews: [], fetchedAt: now,
    };
    const negativeReviews = reviews.filter((review) => review.negative);
    return {
        state: reviews.length ? REVIEW_SOURCE_STATES.success : REVIEW_SOURCE_STATES.empty,
        clientId: identity.clientId,
        profileUrl: identity.profileUrl,
        reviews,
        negativeReviews,
        fetchedAt: now,
    };
}

export function extractReviewPayload(documentObject) {
    const scripts = documentObject?.querySelectorAll?.('script[type="application/json"], script#__NEXT_DATA__') || [];
    for (const script of scripts) {
        try {
            const value = JSON.parse(script.textContent || '');
            if (reviewCollections(value).length) return value;
        } catch {
            // Ignore unrelated or malformed page scripts. Unknown data is not treated as an empty result.
        }
    }
    return null;
}

export class ClientReviewAdapter {
    constructor({ fetchImpl = globalThis.fetch, DOMParserClass = globalThis.DOMParser, now = () => Date.now() } = {}) {
        this.fetchImpl = fetchImpl;
        this.DOMParserClass = DOMParserClass;
        this.now = now;
    }

    resolveClient(panel) {
        return resolvePublicClientIdentity(panel);
    }

    async fetch(identity, { signal } = {}) {
        if (!identity?.clientId || !identity?.profileUrl) return normalizeReviewContext(null, identity || {}, this.now());
        if (typeof this.fetchImpl !== 'function' || typeof this.DOMParserClass !== 'function') {
            return normalizeReviewContext(null, identity, this.now());
        }
        const response = await this.fetchImpl(identity.profileUrl, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'text/html' },
            signal,
        });
        if (!response?.ok) throw new Error(`Public profile request failed (${response?.status || 'unknown'})`);
        const documentObject = new this.DOMParserClass().parseFromString(await response.text(), 'text/html');
        return normalizeReviewContext(extractReviewPayload(documentObject), identity, this.now());
    }
}
