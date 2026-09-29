import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniDocument, descendants } from './helpers/mini-dom.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';
import { ConfigStore } from '../src/core/config-store.js';
import { Clipboard } from '../src/core/clipboard.js';
import { OrderConfigRepository } from '../src/order/order-config.js';
import {
    canonicalProfileUrl,
    clientReviewEntriesUrl,
    ClientReviewAdapter,
    extractClientReviewSource,
    normalizePublicHandle,
    normalizePublicReview,
    normalizeReviewContext,
    normalizeReviewEntries,
    resolvePublicClientIdentity,
    REVIEW_SOURCE_STATES,
} from '../src/order/client-review-adapter.js';
import {
    ClientBackgroundCache,
    CLIENT_BACKGROUND_ERROR_TTL_MS,
    CLIENT_BACKGROUND_TTL_MS,
} from '../src/order/client-background-cache.js';
import { backgroundLevel, OrderAssistantRuntime, OrderAssistantSession } from '../src/order/order-assistant.js';
import { defaultOrderPanelResolver, OrderDetailLifecycle } from '../src/order/order-detail-lifecycle.js';

class Observer {
    static instances = [];
    constructor(callback) { this.callback = callback; this.disconnected = false; Observer.instances.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
    emit(records) { this.callback(records); }
}

function identity(id, mountTarget = null) {
    const handle = normalizePublicHandle(id);
    return { clientId: `@${handle}`, handle, profileUrl: canonicalProfileUrl(handle), mountTarget };
}

function buttons(root) {
    return descendants(root).filter((node) => node.tagName === 'BUTTON');
}

test('Iteration 5 L1: Copy ID uses the public handle and Copy Profile URL is canonical', async () => {
    assert.equal(normalizePublicHandle('@Client_Name-1'), 'Client_Name-1');
    assert.equal(normalizePublicHandle('creator'), '');
    assert.equal(canonicalProfileUrl('Client_Name-1'), 'https://vgen.co/Client_Name-1');

    const anchor = {
        href: 'https://vgen.co/Client_Name-1?ignored=1', textContent: '@Client_Name-1', parentElement: {},
        closest: () => null,
    };
    const resolved = resolvePublicClientIdentity({ querySelectorAll: () => [anchor], ownerDocument: { location: { href: 'https://vgen.co/creator/commissions' } } });
    assert.equal(resolved.clientId, '@Client_Name-1');
    assert.equal(resolved.profileUrl, 'https://vgen.co/Client_Name-1');
    assert.equal(resolvePublicClientIdentity({ querySelectorAll: () => [] }), null);

    const writes = [];
    const clipboard = new Clipboard({ gmSetClipboard: (value) => writes.push(value) });
    await clipboard.writeText(resolved.clientId);
    await clipboard.writeText(resolved.profileUrl);
    assert.deepEqual(writes, ['@Client_Name-1', 'https://vgen.co/Client_Name-1']);
});

test('Iteration 5 L1: public review normalization distinguishes five-star, negative, empty and malformed data', () => {
    const client = identity('client-a');
    const five = normalizeReviewContext({ reviews: [{ rating: 5, body: 'Great client' }] }, client, 10);
    assert.equal(five.state, REVIEW_SOURCE_STATES.success);
    assert.equal(five.negativeReviews.length, 0);

    const oneLow = normalizeReviewContext({ reviews: [{ rating: 5, body: 'A' }, { rating: 4, body: 'B' }] }, client, 11);
    assert.deepEqual(oneLow.negativeReviews.map((review) => review.rating), [4]);
    const multiple = normalizeReviewContext({ reviews: [{ score: 3, text: 'C' }, { stars: 2, comment: 'D' }] }, client, 12);
    assert.deepEqual(multiple.negativeReviews.map((review) => review.rating), [3, 2]);

    assert.equal(normalizeReviewContext({ reviews: [] }, client).state, REVIEW_SOURCE_STATES.empty);
    assert.equal(normalizeReviewContext({ somethingElse: [] }, client).state, REVIEW_SOURCE_STATES.unavailable);
    assert.equal(normalizeReviewContext({ reviews: [{ rating: 'bad', body: '' }] }, client).state, REVIEW_SOURCE_STATES.unavailable);
    assert.equal(normalizeReviewContext({ reviews: [{ rating: 5, body: 'Valid' }, { rating: 'bad', body: '' }] }, client).state, REVIEW_SOURCE_STATES.unavailable);
    assert.equal(normalizePublicReview({ rating: 4, body: 'Keep exact body', reviewer: 'Anonymous' }).body, 'Keep exact body');
});

test('Iteration 5 L1: current binary client-review payload normalizes recommendation and non-recommendation', () => {
    const client = identity('binary-client');
    const result = normalizeReviewContext([
        { wouldRecommend: true, reviewText: 'Public recommendation text' },
        { wouldRecommend: false, reviewText: 'Public non-recommendation text' },
    ], client, 20);
    assert.equal(result.state, REVIEW_SOURCE_STATES.success);
    assert.equal(result.reviews.length, 2);
    assert.equal(result.negativeReviews.length, 1);
    assert.equal(result.negativeReviews[0].wouldRecommend, false);
    assert.equal(result.negativeReviews[0].body, 'Public non-recommendation text');
    assert.equal(normalizeReviewContext([{ wouldRecommend: true, reviewText: 'Only recommendation' }], client).negativeReviews.length, 0);
    assert.equal(normalizeReviewContext([{ wouldRecommend: 'yes', reviewText: 'Not a boolean' }], client).state, REVIEW_SOURCE_STATES.unavailable);
});

function reviewEntry(overrides = {}) {
    return {
        _id: 'a1', clientReviewID: 'c1', reviewText: 'Public review body', wouldRecommend: true,
        created: '2026-09-18T03:27:06.276Z', ...overrides,
    };
}

function profileHtml(userId, stats) {
    const payload = { props: { pageProps: { user: { userID: userId, username: 'Client_A', clientReviewStats: stats } } } };
    return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></body></html>`;
}

function reviewAdapter({ userId = '00000000-0000-0000-0000-000000000000', stats = null, pages = [[]], requests = [] }) {
    class Parser {
        parseFromString(html) {
            const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            return { querySelectorAll: () => (match ? [{ textContent: match[1] }] : []) };
        }
    }
    const adapter = new ClientReviewAdapter({
        DOMParserClass: Parser, now: () => 42,
        fetchImpl: async (url, options) => {
            requests.push({ url: String(url), options });
            if (String(url).startsWith('https://vgen.co/')) return { ok: true, text: async () => profileHtml(userId, stats) };
            const page = pages.shift();
            if (page === 'not-ok') return { ok: false, status: 500, json: async () => [] };
            if (page === 'malformed') return { ok: true, json: async () => ({ not: 'an array' }) };
            return { ok: true, json: async () => (Array.isArray(page) ? page : []) };
        },
    });
    return adapter;
}

test('Iteration 5 L1: adapter resolves client user id and fetches binary reviews (2 recommend / 0 not)', async () => {
    const requests = [];
    const stats = { totalReviews: 2, totalPositiveReviews: 2, totalNegativeReviews: 0 };
    const adapter = reviewAdapter({
        stats, requests,
        pages: [[
            reviewEntry({ reviewText: 'Great client', wouldRecommend: true }),
            reviewEntry({ reviewText: 'Very patient', wouldRecommend: true }),
        ]],
    });
    const result = await adapter.fetch(identity('binary-ok'));
    assert.equal(result.state, REVIEW_SOURCE_STATES.success);
    assert.equal(result.reviews.length, 2);
    assert.equal(result.negativeReviews.length, 0);
    assert.equal(result.negativeCount, 0);
    const entriesRequests = requests.filter((request) => request.url.includes('discoverability/reviews/client'));
    assert.equal(entriesRequests.length, 1);
    assert.equal(entriesRequests[0].options.method, 'GET');
    assert.equal(entriesRequests[0].options.headers['v-client-id'], 'vgen-web');
    assert.match(entriesRequests[0].url, /offset=0&limit=20$/);
});

test('Iteration 5 L1: adapter reports one binary non-recommendation', async () => {
    const requests = [];
    const stats = { totalReviews: 2, totalPositiveReviews: 1, totalNegativeReviews: 1 };
    const adapter = reviewAdapter({
        stats, requests,
        pages: [[
            reviewEntry({ reviewText: 'Recommended', wouldRecommend: true }),
            reviewEntry({ reviewText: 'Not recommended', wouldRecommend: false }),
        ]],
    });
    const result = await adapter.fetch(identity('binary-neg'));
    assert.equal(result.state, REVIEW_SOURCE_STATES.success);
    assert.equal(result.negativeReviews.length, 1);
    assert.equal(result.negativeReviews[0].body, 'Not recommended');
    assert.equal(result.negativeCount, 1);
});

test('Iteration 5 L1: normalizeReviewEntries isolates multiple negative reviews and trusts the stats count', () => {
    const client = identity('multi');
    const result = normalizeReviewEntries([
        { wouldRecommend: true, reviewText: 'A' },
        { wouldRecommend: false, reviewText: 'B' },
        { wouldRecommend: false, reviewText: 'C' },
    ], client, 5, { totalReviews: 10, totalNegativeReviews: 3 });
    assert.equal(result.state, REVIEW_SOURCE_STATES.success);
    assert.deepEqual(result.negativeReviews.map((review) => review.body), ['B', 'C']);
    assert.equal(result.negativeCount, 3);
});

test('Iteration 5 L1: entries paginate with offset/limit and stop on a short page', async () => {
    const requests = [];
    const stats = { totalReviews: 22, totalPositiveReviews: 22, totalNegativeReviews: 0 };
    const page1 = Array.from({ length: 20 }, (_, i) => reviewEntry({ reviewText: `R${i}`, wouldRecommend: true }));
    const page2 = Array.from({ length: 2 }, (_, i) => reviewEntry({ reviewText: `R${20 + i}`, wouldRecommend: true }));
    const adapter = reviewAdapter({ stats, pages: [page1, page2], requests });
    const result = await adapter.fetch(identity('paged'));
    assert.equal(result.state, REVIEW_SOURCE_STATES.success);
    assert.equal(result.reviews.length, 22);
    const entriesRequests = requests.filter((request) => request.url.includes('discoverability/reviews/client'));
    assert.deepEqual(entriesRequests.map((request) => request.url.match(/offset=(\d+)/)[1]), ['0', '20']);
    assert.ok(entriesRequests.every((request) => request.url.includes('limit=20')));
});

test('Iteration 5 L1: entries request failure and malformed response are errors, never a safe empty result', async () => {
    const notOk = reviewAdapter({ stats: { totalReviews: 2, totalNegativeReviews: 0 }, pages: ['not-ok'] });
    await assert.rejects(() => notOk.fetch(identity('failing')), /entries request failed/);
    const malformed = reviewAdapter({ stats: { totalReviews: 2, totalNegativeReviews: 0 }, pages: ['malformed'] });
    await assert.rejects(() => malformed.fetch(identity('malformed')), /malformed/);
});

test('Iteration 5 L1: stats claiming reviews but no entries fetched is unavailable, not empty', () => {
    const client = identity('mismatch');
    const result = normalizeReviewEntries([], client, 8, { totalReviews: 170, totalNegativeReviews: 0 });
    assert.equal(result.state, REVIEW_SOURCE_STATES.unavailable);
    assert.equal(result.negativeReviews.length, 0);
});

test('Iteration 5 L1: legacy rating review items remain compatible through normalizeReviewEntries', () => {
    const client = identity('legacy');
    const result = normalizeReviewEntries([
        { rating: 5, body: 'Five star' },
        { rating: 4, body: 'Four star' },
    ], client, 7, null);
    assert.equal(result.state, REVIEW_SOURCE_STATES.success);
    assert.deepEqual(result.negativeReviews.map((review) => review.rating), [4]);
    assert.equal(result.negativeCount, 1);
});

test('Iteration 5 L1: cached client background does not refetch review entries', async () => {
    const requests = [];
    const adapter = reviewAdapter({ stats: { totalReviews: 1, totalNegativeReviews: 0 }, pages: [[reviewEntry({ reviewText: 'One', wouldRecommend: true })]], requests });
    const cache = new ClientBackgroundCache({ now: () => 1 });
    const client = identity('cached');
    const first = await cache.load(client, () => adapter.fetch(client));
    const second = await cache.load(client, () => adapter.fetch(client));
    assert.equal(first.fromCache, false);
    assert.equal(second.fromCache, true);
    assert.equal(requests.filter((request) => request.url.includes('discoverability/reviews/client')).length, 1);
});

test('Iteration 5 L1: extracts client user id and builds the verified entries endpoint', () => {
    const payload = { props: { pageProps: { user: { userID: '00000000-0000-0000-0000-000000000000', clientReviewStats: { totalReviews: 3, totalNegativeReviews: 1 } } } } };
    const source = extractClientReviewSource(payload);
    assert.equal(source.clientUserId, '00000000-0000-0000-0000-000000000000');
    assert.equal(source.clientReviewStats.totalNegativeReviews, 1);
    assert.equal(extractClientReviewSource({ props: { pageProps: {} } }), null);
    assert.equal(clientReviewEntriesUrl('00000000-0000-0000-0000-000000000000'), 'https://api.vgen.co/discoverability/reviews/client/00000000-0000-0000-0000-000000000000');
    assert.equal(clientReviewEntriesUrl('bad'), '');
});

test('Iteration 5 L1: public review adapter only performs GET and request errors remain errors', async () => {
    const requests = [];
    const payload = { props: { pageProps: { reviews: [{ rating: 4, body: 'Public context' }] } } };
    class Parser {
        parseFromString() { return { querySelectorAll: () => [{ textContent: JSON.stringify(payload) }] }; }
    }
    const adapter = new ClientReviewAdapter({
        fetchImpl: async (url, options) => { requests.push({ url, options }); return { ok: true, text: async () => '<html></html>' }; },
        DOMParserClass: Parser,
        now: () => 25,
    });
    const result = await adapter.fetch(identity('client-a'));
    assert.equal(result.negativeReviews.length, 1);
    assert.equal(requests[0].options.method, 'GET');
    assert.equal(requests[0].url, 'https://vgen.co/client-a');

    const cache = new ClientBackgroundCache({ now: () => 30 });
    const failed = await cache.load(identity('client-b'), async () => { throw new Error('network down'); });
    assert.equal(failed.state, REVIEW_SOURCE_STATES.error);
    assert.equal(failed.reviews.length, 0);
});

test('Iteration 5 L1: cache covers first fetch, hit, expiry, A to B to A, inflight and short error cache', async () => {
    let now = 100;
    let calls = 0;
    const cache = new ClientBackgroundCache({ now: () => now });
    const loader = async (client) => { calls += 1; return normalizeReviewContext({ reviews: [{ rating: 5, body: client.clientId }] }, client, now); };
    const a = identity('a'); const b = identity('b');
    assert.equal((await cache.load(a, () => loader(a))).fromCache, false);
    assert.equal((await cache.load(a, () => loader(a))).fromCache, true);
    await cache.load(b, () => loader(b));
    assert.equal((await cache.load(a, () => loader(a))).fromCache, true);
    assert.equal(calls, 2);

    let release;
    const pendingLoader = () => new Promise((resolve) => { release = resolve; });
    const c = identity('c');
    const first = cache.load(c, pendingLoader);
    const second = cache.load(c, pendingLoader);
    release(normalizeReviewContext({ reviews: [] }, c, now));
    await Promise.all([first, second]);
    assert.equal(cache.entries.has('@c'), true);

    now += CLIENT_BACKGROUND_TTL_MS + 1;
    await cache.load(a, () => loader(a));
    assert.equal(calls, 3);
    const errored = await cache.load(identity('error'), async () => { calls += 1; throw new Error('offline'); });
    assert.equal(errored.state, REVIEW_SOURCE_STATES.error);
    await cache.load(identity('error'), async () => { calls += 1; throw new Error('again'); });
    const afterCachedError = calls;
    now += CLIENT_BACKGROUND_ERROR_TTL_MS + 1;
    await cache.load(identity('error'), async () => { calls += 1; throw new Error('again'); });
    assert.equal(calls, afterCachedError + 1);
});

test('Iteration 5 L2: Order Detail lifecycle mounts for every status, switches client, closes and reopens once', () => {
    Observer.instances = [];
    const documentObject = new MiniDocument();
    const panel = documentObject.createElement('section');
    panel.dataset.order = 'true'; panel.dataset.client = 'pending-client'; panel.dataset.status = 'pending-like';
    documentObject.body.append(panel);
    const events = [];
    const lifecycle = new OrderDetailLifecycle({
        documentObject, MutationObserverClass: Observer,
        panelResolver: (root) => root.dataset?.order ? root : null,
        identityResolver: (root) => identity(root.dataset.client, root),
    });
    lifecycle.subscribe((event) => events.push(`${event.type}:${event.identity?.clientId || ''}`));
    lifecycle.mount();
    assert.equal(lifecycle.panel, panel);
    assert.deepEqual(events, ['open:@pending-client']);
    const panelObserver = Observer.instances.find((item) => item.target === panel);
    panel.dataset.status = 'active-like'; panel.dataset.client = 'active-client';
    panelObserver.emit([{ addedNodes: [], removedNodes: [] }]);
    panel.dataset.status = 'completed-like'; panel.dataset.client = 'completed-client';
    panelObserver.emit([{ addedNodes: [], removedNodes: [] }]);
    assert.deepEqual(events.slice(-2), ['change:@active-client', 'change:@completed-client']);

    const bodyObserver = Observer.instances.find((item) => item.target === documentObject.body);
    panel.remove(); bodyObserver.emit([{ addedNodes: [], removedNodes: [panel] }]);
    assert.equal(lifecycle.panel, null);
    const reopened = documentObject.createElement('section'); reopened.dataset.order = 'true'; reopened.dataset.client = 'pending-client';
    documentObject.body.append(reopened); bodyObserver.emit([{ addedNodes: [reopened], removedNodes: [] }]);
    assert.equal(lifecycle.panel, reopened);
    assert.equal(events.filter((event) => event.startsWith('open:')).length, 2);
    lifecycle.unmount();
    assert.equal(Observer.instances.every((item) => item.disconnected), true);
});

test('Iteration 5 L2: bounded portal probe mounts asynchronous detail and releases immediately', () => {
    Observer.instances = [];
    const documentObject = new MiniDocument();
    const lifecycle = new OrderDetailLifecycle({
        documentObject, MutationObserverClass: Observer,
        panelResolver: (root) => root.dataset?.order ? root : null,
        identityResolver: (root) => identity(root.dataset.client, root),
    });
    lifecycle.mount();
    const bodyObserver = Observer.instances.find((item) => item.target === documentObject.body);
    const portal = documentObject.createElement('section');
    documentObject.body.append(portal);
    bodyObserver.emit([{ addedNodes: [portal], removedNodes: [] }]);
    const probe = Observer.instances.find((item) => item.target === portal);
    assert.equal(probe.options.subtree, true);
    portal.dataset.order = 'true'; portal.dataset.client = 'async-client';
    probe.emit([{ addedNodes: [], removedNodes: [] }]);
    assert.equal(lifecycle.identity.clientId, '@async-client');
    assert.equal(probe.disconnected, true);
    lifecycle.unmount();
});

test('Iteration 5 L2: replacing the current client mount target refreshes one session', () => {
    Observer.instances = [];
    const documentObject = new MiniDocument();
    const panel = documentObject.createElement('section'); documentObject.body.append(panel);
    const firstTarget = documentObject.createElement('div'); panel.append(firstTarget);
    let currentTarget = firstTarget;
    const events = [];
    const lifecycle = new OrderDetailLifecycle({
        documentObject, MutationObserverClass: Observer,
        panelResolver: (root) => root === panel ? panel : null,
        identityResolver: () => identity('stable-client', currentTarget),
    });
    lifecycle.subscribe((event) => events.push(event.type));
    lifecycle.mount();
    const secondTarget = documentObject.createElement('div'); panel.append(secondTarget); currentTarget = secondTarget;
    Observer.instances.find((item) => item.target === panel).emit([{ addedNodes: [secondTarget], removedNodes: [firstTarget] }]);
    assert.deepEqual(events, ['open', 'change']);
    lifecycle.unmount();
});

test('Iteration 5 L2: commission-card click performs only bounded portal scans for pre-created React portals', () => {
    Observer.instances = [];
    const documentObject = new MiniDocument();
    const portal = documentObject.createElement('div'); portal.className = 'ReactModalPortal'; documentObject.body.append(portal);
    const scheduled = [];
    const clock = {
        setTimeout(callback, delay) { const entry = { callback, delay, cleared: false }; scheduled.push(entry); return entry; },
        clearTimeout(entry) { entry.cleared = true; },
    };
    const lifecycle = new OrderDetailLifecycle({
        documentObject, MutationObserverClass: Observer, clock,
        panelResolver: (root) => root.dataset?.ready ? root : null,
        identityResolver: (root) => identity('click-client', root),
    });
    lifecycle.mount();
    const card = documentObject.createElement('div'); card.className = 'commissionCardContainer';
    lifecycle.onDocumentClick({ target: card });
    assert.deepEqual(scheduled.map((entry) => entry.delay), [0, 80, 250, 700, 1500]);
    portal.dataset.ready = 'true';
    scheduled[1].callback();
    assert.equal(lifecycle.identity.clientId, '@click-client');
    assert.equal(scheduled.every((entry) => entry.cleared || entry === scheduled[1]), true);
    lifecycle.unmount();
});

test('Iteration 5 L2: current VGen CommissionModal selector resolves without relying on a route or status', () => {
    const anchor = { href: 'https://vgen.co/safe-client', textContent: '@safe-client', parentElement: {}, closest: () => null };
    const modal = { matches: (selector) => selector.includes('CommissionModal__Container'), querySelectorAll: () => [anchor] };
    const portal = { querySelectorAll() {}, matches: () => false, querySelector: (selector) => selector.includes('CommissionModal__Container') ? modal : null };
    assert.equal(defaultOrderPanelResolver(portal), modal);
});

test('Iteration 5 L2: detached VGen modal starts one bounded recovery scan for its pre-created portal', () => {
    Observer.instances = [];
    const documentObject = new MiniDocument();
    const portal = documentObject.createElement('div'); portal.className = 'ReactModalPortal'; documentObject.body.append(portal);
    const panel = documentObject.createElement('section'); portal.append(panel);
    const scheduled = [];
    const clock = {
        setTimeout(callback, delay) { const entry = { callback, delay, cleared: false }; scheduled.push(entry); return entry; },
        clearTimeout(entry) { entry.cleared = true; },
    };
    const lifecycle = new OrderDetailLifecycle({
        documentObject, MutationObserverClass: Observer, clock,
        panelResolver: (root) => root === portal ? root.querySelector('section') : root.matches?.('section') ? root : null,
        identityResolver: (root) => identity('replacement-client', root),
    });
    lifecycle.mount();
    assert.equal(lifecycle.identity.clientId, '@replacement-client');
    panel.remove();
    Observer.instances.find((observer) => observer.target === panel).callback([]);
    assert.equal(lifecycle.identity, null);
    assert.deepEqual(scheduled.map((entry) => entry.delay), [0, 80, 250, 700, 1500]);
    const replacement = documentObject.createElement('section'); portal.append(replacement);
    scheduled[1].callback();
    assert.equal(lifecycle.identity.clientId, '@replacement-client');
    lifecycle.unmount();
});

test('Iteration 5 L1: background level prioritizes red > yellow > green and handles empty/error', () => {
    const client = identity('level');
    assert.equal(backgroundLevel(normalizeReviewContext([{ wouldRecommend: false, reviewText: 'Bad' }], client)).level, 'red');
    assert.equal(backgroundLevel(normalizeReviewContext([{ rating: 5, body: 'A' }, { rating: 3, body: 'B' }], client)).level, 'red');
    assert.equal(backgroundLevel(normalizeReviewContext([{ rating: 5, body: 'A' }, { rating: 4, body: 'B' }], client)).level, 'yellow');
    assert.equal(backgroundLevel(normalizeReviewContext([{ rating: 5, body: 'A' }, { wouldRecommend: true, reviewText: 'B' }], client)).level, 'green');
    assert.equal(backgroundLevel(null).level, 'muted');
    assert.equal(backgroundLevel({ state: REVIEW_SOURCE_STATES.empty, reviews: [] }).level, 'muted');
    assert.equal(backgroundLevel({ state: REVIEW_SOURCE_STATES.error, reviews: [] }).level, 'muted');
});

test('Iteration 5 L2: background bar reports yellow for four-star and copies via icon actions', async () => {
    const documentObject = new MiniDocument();
    const panel = documentObject.createElement('section'); documentObject.body.append(panel);
    const writes = [];
    const session = new OrderAssistantSession({
        panel, identity: identity('review-client', panel), settings: { copyButtons: true, clientBackground: true },
        adapter: { fetch: async () => normalizeReviewContext({ reviews: [] }, identity('review-client')) },
        cache: new ClientBackgroundCache(), clipboard: { writeText: async (value) => writes.push(value) },
    });
    session.mount();
    session.result = normalizeReviewContext({ reviews: [{ rating: 4, body: 'Selectable review body', reviewer: 'Anonymous' }] }, session.identity);
    session.render();
    assert.equal(session.bar.dataset.level, 'yellow');
    assert.equal(session.label.textContent, '存在非满分评价');
    const copyId = buttons(session.actions).find((button) => button.dataset.action === 'copy-id');
    const copyUrl = buttons(session.actions).find((button) => button.dataset.action === 'copy-url');
    assert.ok(copyId && copyUrl);
    copyId.click();
    await Promise.resolve();
    assert.deepEqual(writes, ['@review-client']);
    const body = descendants(session.popover).find((node) => node.className === 'vgen-nya-background__review-body');
    assert.equal(body.textContent, 'Selectable review body');
    assert.equal(body.translate, true);
    buttons(session.popover).find((button) => button.dataset.action === 'copy-review').click();
    await Promise.resolve();
    assert.deepEqual(writes, ['@review-client', 'Selectable review body']);
    session.unmount();
});

test('Iteration 5 L2: binary non-recommendation reports red and lists only the negative record', () => {
    const documentObject = new MiniDocument();
    const panel = documentObject.createElement('section'); documentObject.body.append(panel);
    const session = new OrderAssistantSession({
        panel, identity: identity('binary-ui', panel), settings: { copyButtons: false, clientBackground: true },
        adapter: { fetch: async () => normalizeReviewContext([], identity('binary-ui')) },
        cache: new ClientBackgroundCache(), clipboard: { writeText: async () => {} },
    });
    session.mount();
    session.result = normalizeReviewContext([
        { wouldRecommend: true, reviewText: 'Recommended client' },
        { wouldRecommend: false, reviewText: 'Not recommended' },
    ], session.identity);
    session.render();
    assert.equal(session.bar.dataset.level, 'red');
    assert.equal(session.label.textContent, '存在不推荐记录');
    const labels = descendants(session.popover).filter((node) => node.tagName === 'STRONG').map((node) => node.textContent);
    assert.equal(labels.includes('不推荐'), true);
    const bodies = descendants(session.popover).filter((node) => node.className === 'vgen-nya-background__review-body').map((node) => node.textContent);
    assert.deepEqual(bodies, ['Not recommended']);
    session.unmount();
});

test('Iteration 5 L2: five-star history reports green and does not list normal reviews', () => {
    const documentObject = new MiniDocument();
    const panel = documentObject.createElement('section'); documentObject.body.append(panel);
    const session = new OrderAssistantSession({
        panel, identity: identity('green-ui', panel), settings: { copyButtons: false, clientBackground: true },
        adapter: { fetch: async () => normalizeReviewContext([], identity('green-ui')) },
        cache: new ClientBackgroundCache(), clipboard: { writeText: async () => {} },
    });
    session.mount();
    session.result = normalizeReviewContext([{ rating: 5, body: 'Five star' }, { wouldRecommend: true, reviewText: 'Recommended' }], session.identity);
    session.render();
    assert.equal(session.bar.dataset.level, 'green');
    assert.equal(session.label.textContent, '评价记录正常');
    const empty = descendants(session.popover).find((node) => node.className === 'vgen-nya-background__empty');
    assert.equal(empty.textContent, '无需要关注的记录');
    session.unmount();
});

test('Iteration 5 L2: runtime keeps one UI session and settings coexist with the existing order preset domain', () => {
    const documentObject = new MiniDocument();
    const panel = documentObject.createElement('section'); documentObject.body.append(panel);
    const listeners = new Set();
    const lifecycle = {
        mount() {}, unmount() {}, dispose() {},
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        emit(event) { for (const listener of listeners) listener(event); },
    };
    const store = new ConfigStore(new MemoryStorageDriver());
    const repository = new OrderConfigRepository(store);
    const runtime = new OrderAssistantRuntime({
        repository, clipboard: { writeText() {} }, documentObject, detailLifecycle: lifecycle,
        adapter: { resolveClient: () => null, fetch: async (client) => normalizeReviewContext({ reviews: [] }, client) },
    });
    runtime.mount();
    lifecycle.emit({ type: 'open', panel, identity: identity('a', panel) });
    const assistantCount = () => descendants(documentObject.body).filter((node) => node.dataset.vgenNyaUi === 'client-background').length;
    assert.equal(assistantCount(), 1);
    lifecycle.emit({ type: 'change', panel, identity: identity('b', panel) });
    assert.equal(assistantCount(), 1);
    repository.write({ copyButtons: false, clientBackground: false });
    assert.equal(assistantCount(), 0);
    runtime.unmount();
    assert.equal(listeners.size, 0);
});
