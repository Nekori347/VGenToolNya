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

// Verified against the live VGen API (2026-09-29): the "See all" client-review
// collection is a GET to api.vgen.co/discoverability/reviews/client/{userID}
// with offset/limit pagination. limit > 20 returns 400. The response is a bare
// JSON array of review items; it carries no rating, total or cursor fields.
export const CLIENT_REVIEW_PAGE_LIMIT = 20;
export const CLIENT_REVIEW_MAX_PAGES = 5;
export const CLIENT_REVIEW_ENTRIES_ORIGIN = 'https://api.vgen.co';

export function clientReviewEntriesUrl(clientUserId) {
    const id = String(clientUserId || '').trim();
    if (!/^[A-Za-z0-9-]{8,}$/.test(id)) return '';
    return `${CLIENT_REVIEW_ENTRIES_ORIGIN}/discoverability/reviews/client/${encodeURIComponent(id)}`;
}

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
        negativeCount: negativeReviews.length,
        fetchedAt: now,
    };
}

function scriptPayloads(documentObject) {
    const scripts = documentObject?.querySelectorAll?.('script[type="application/json"], script#__NEXT_DATA__') || [];
    const values = [];
    for (const script of scripts) {
        try {
            const value = JSON.parse(script.textContent || '');
            if (value && typeof value === 'object') values.push(value);
        } catch {
            // Ignore unrelated or malformed page scripts. Unknown data is not treated as an empty result.
        }
    }
    return values;
}

export function extractReviewPayload(documentObject) {
    for (const value of scriptPayloads(documentObject)) {
        if (reviewCollections(value).length) return value;
    }
    return null;
}

export function extractPagePayload(documentObject) {
    for (const value of scriptPayloads(documentObject)) {
        if (value?.props?.pageProps) return value;
    }
    return null;
}

// Resolves the stable client user id and public review stats from a VGen
// profile page payload. The live profile __NEXT_DATA__ exposes
// props.pageProps.user.userID and props.pageProps.user.clientReviewStats.
export function extractClientReviewSource(payload) {
    const user = payload?.props?.pageProps?.user;
    if (!user || typeof user !== 'object') return null;
    const clientUserId = typeof user.userID === 'string' ? user.userID.trim() : '';
    if (!clientUserId) return null;
    const clientReviewStats = user.clientReviewStats && typeof user.clientReviewStats === 'object' ? user.clientReviewStats : null;
    return { clientUserId, clientReviewStats };
}

export function normalizeReviewEntries(entries, identity, now = Date.now(), stats = null) {
    const list = Array.isArray(entries) ? entries : [];
    const reviews = list.map(normalizePublicReview).filter(Boolean);
    const totalReviews = Number(stats?.totalReviews);
    // Unknown schema, or a stats/entries mismatch (stats claim reviews exist but
    // none were fetched), is never treated as a safe empty result.
    if ((list.length && !reviews.length) || (!list.length && Number.isFinite(totalReviews) && totalReviews > 0)) {
        return {
            state: REVIEW_SOURCE_STATES.unavailable,
            clientId: identity.clientId,
            profileUrl: identity.profileUrl,
            reviews: [], negativeReviews: [], negativeCount: 0,
            clientReviewStats: stats && typeof stats === 'object' ? stats : null, fetchedAt: now,
        };
    }
    const negativeReviews = reviews.filter((review) => review.negative);
    const totalNegative = Number(stats?.totalNegativeReviews);
    return {
        state: reviews.length ? REVIEW_SOURCE_STATES.success : REVIEW_SOURCE_STATES.empty,
        clientId: identity.clientId,
        profileUrl: identity.profileUrl,
        reviews,
        negativeReviews,
        negativeCount: Number.isFinite(totalNegative) ? totalNegative : negativeReviews.length,
        clientReviewStats: stats && typeof stats === 'object' ? stats : null,
        fetchedAt: now,
    };
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
        const source = extractClientReviewSource(extractPagePayload(documentObject));
        if (source?.clientUserId) {
            const entries = await this.#fetchReviewEntries(source.clientUserId, { signal });
            return normalizeReviewEntries(entries, { ...identity, clientUserId: source.clientUserId }, this.now(), source.clientReviewStats);
        }
        return normalizeReviewContext(extractReviewPayload(documentObject), identity, this.now());
    }

    async #fetchReviewEntries(clientUserId, { signal }) {
        const limit = CLIENT_REVIEW_PAGE_LIMIT;
        const entries = [];
        let offset = 0;
        for (let page = 0; page < CLIENT_REVIEW_MAX_PAGES; page += 1) {
            const url = `${clientReviewEntriesUrl(clientUserId)}?offset=${offset}&limit=${limit}`;
            const response = await this.fetchImpl(url, {
                method: 'GET',
                credentials: 'same-origin',
                headers: { Accept: 'application/json', 'v-client-id': 'vgen-web' },
                signal,
            });
            if (!response?.ok) throw new Error(`Public review entries request failed (${response?.status || 'unknown'})`);
            const items = await response.json();
            if (!Array.isArray(items)) throw new Error('Public review entries response was malformed');
            if (!items.length) break;
            entries.push(...items);
            if (items.length < limit) break;
            offset += limit;
        }
        return entries;
    }
}
