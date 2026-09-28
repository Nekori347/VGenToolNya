import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniDocument, descendants } from './helpers/mini-dom.js';
import { ClientBackgroundCache } from '../src/order/client-background-cache.js';
import {
    normalizeReviewContext,
    normalizeReviewEntries,
    REVIEW_SOURCE_STATES,
} from '../src/order/client-review-adapter.js';
import {
    ExportAdapter,
    normalizeOrder,
    normalizeOrderClient,
    normalizeOrderReview,
    ORDER_EXPORT_SCHEMA_VERSION,
} from '../src/order/export-adapter.js';
import { OrderAssistantSession } from '../src/order/order-assistant.js';

function identity(id, mountTarget = null) {
    return { clientId: `@${id}`, handle: id, profileUrl: `https://vgen.co/${id}`, mountTarget };
}

test('Iteration 8 L1: normal order normalizes identity and review context into a stable shape', () => {
    const client = identity('client-a');
    const context = normalizeReviewContext([
        { wouldRecommend: true, reviewText: 'Recommended', reviewer: 'Anonymous', date: '2026-09-18' },
        { wouldRecommend: false, reviewText: 'Not recommended', reviewer: 'Artist B' },
    ], client, 42);
    const order = normalizeOrder(client, context);
    assert.equal(order.schemaVersion, ORDER_EXPORT_SCHEMA_VERSION);
    assert.deepEqual(order.client, { clientId: '@client-a', handle: 'client-a', profileUrl: 'https://vgen.co/client-a' });
    assert.equal(order.review.state, REVIEW_SOURCE_STATES.success);
    assert.equal(order.review.negativeCount, 1);
    assert.equal(order.review.fetchedAt, 42);
    assert.equal(order.review.reviews.length, 2);
    assert.deepEqual(order.review.reviews[0], {
        body: 'Recommended', negative: false, rating: null, wouldRecommend: true,
        reviewer: 'Anonymous', date: '2026-09-18', context: null,
    });
    assert.deepEqual(order.review.reviews[1], {
        body: 'Not recommended', negative: true, rating: null, wouldRecommend: false,
        reviewer: 'Artist B', date: null, context: null,
    });
});

test('Iteration 8 L1: missing optional fields still produce a stable, non-empty shape', () => {
    const order = normalizeOrder(null, { reviews: [{ body: 'Bare body' }] });
    assert.deepEqual(order.client, { clientId: '', handle: '', profileUrl: '' });
    assert.equal(order.review.state, '');
    assert.equal(order.review.reviews.length, 1);
    assert.deepEqual(order.review.reviews[0], {
        body: 'Bare body', negative: false, rating: null, wouldRecommend: null,
        reviewer: null, date: null, context: null,
    });
    assert.equal(order.review.negativeCount, 0);
    assert.equal(order.review.fetchedAt, null);

    assert.deepEqual(normalizeOrder({}, null).review.reviews, []);
    assert.equal(normalizeOrder(null, null).review.negativeCount, 0);
    assert.equal(normalizeOrderReview(null), null);
    assert.equal(normalizeOrderReview({ body: '' }), null);
});

test('Iteration 8 L1: rating-derived and wouldRecommend-derived negativity stay consistent', () => {
    const order = normalizeOrder(identity('c'), {
        reviews: [{ body: 'Five star', rating: 5 }, { body: 'Four star', rating: 4 }],
    });
    assert.deepEqual(order.review.reviews.map((review) => review.negative), [false, true]);
    assert.equal(order.review.negativeCount, 1);
    assert.equal(order.review.reviews[1].rating, 4);
    assert.equal(order.review.reviews[1].wouldRecommend, null);
});

test('Iteration 8 L1: JSON serialization round-trips and toJSON deep-copies', () => {
    const order = normalizeOrder(identity('serial'), normalizeReviewContext([
        { wouldRecommend: true, reviewText: 'Body' },
    ], identity('serial'), 7));
    const adapter = new ExportAdapter();
    const json = adapter.toJSON(order);
    assert.equal(typeof json, 'object');
    assert.equal(Array.isArray(json), false);
    const text = adapter.serialize(order);
    assert.deepEqual(JSON.parse(text), json);

    // toJSON deep-copies: mutating the copy leaves the source untouched.
    json.client.handle = 'mutated';
    assert.equal(order.client.handle, 'serial');
});

test('Iteration 8 L1: normalizeOrder strips DOM nodes and functions so output stays JSON-safe', () => {
    const node = new MiniDocument().createElement('div');
    const dirty = normalizeOrder(
        { clientId: '@d', handle: 'd', profileUrl: 'https://vgen.co/d', mountTarget: node, fn: () => {} },
        { state: REVIEW_SOURCE_STATES.empty, reviews: [{ body: 'B', negative: false }], fetchedAt: 3, extra: { deep: [1, 2, 3] } },
    );
    const text = JSON.stringify(dirty);
    assert.equal(text.includes('mountTarget'), false);
    assert.equal(text.includes('fn'), false);
    assert.deepEqual(dirty.client, { clientId: '@d', handle: 'd', profileUrl: 'https://vgen.co/d' });
});

test('Iteration 8 L1: sensitive and internal fields are excluded from the export', () => {
    const order = normalizeOrder(
        {
            clientId: '@client-a', handle: 'client-a', profileUrl: 'https://vgen.co/client-a',
            mountTarget: new MiniDocument().createElement('section'),
            clientUserId: '00000000-0000-0000-0000-000000000000',
            authToken: 'secret-token', apiKey: 'sk-secret', cookie: 'session=abc',
        },
        {
            state: REVIEW_SOURCE_STATES.success,
            clientUserId: '00000000-0000-0000-0000-000000000000',
            reviews: [{ body: 'Public body', negative: false, auth: 'secret' }],
            negativeCount: 0,
            fetchedAt: 1,
            fromCache: false,
            error: null,
            clientReviewStats: { totalReviews: 1 },
        },
    );
    const text = JSON.stringify(order);
    assert.equal(text.includes('secret'), false);
    assert.equal(text.includes('00000000-0000-0000-0000-000000000000'), false);
    assert.equal(text.includes('mountTarget'), false);
    assert.equal(text.includes('cookie'), false);
    assert.equal(text.includes('fromCache'), false);
    assert.deepEqual(Object.keys(order), ['schemaVersion', 'client', 'review']);
    assert.deepEqual(Object.keys(order.client), ['clientId', 'handle', 'profileUrl']);
    assert.deepEqual(Object.keys(order.review), ['state', 'reviews', 'negativeCount', 'fetchedAt']);
});

test('Iteration 8 L2: session exportOrder reuses fetched data without a DOM leak or a new fetch', async () => {
    const documentObject = new MiniDocument();
    const panel = documentObject.createElement('section');
    documentObject.body.append(panel);
    let fetchCalls = 0;
    const session = new OrderAssistantSession({
        panel, identity: identity('export-client', panel), settings: { copyButtons: false, clientBackground: true },
        adapter: {
            fetch: async () => {
                fetchCalls += 1;
                return normalizeReviewContext([{ wouldRecommend: false, reviewText: 'Low confidence' }], identity('export-client'));
            },
        },
        cache: new ClientBackgroundCache(), clipboard: { writeText: async () => {} },
    });
    session.mount();
    await session.loadBackground();
    assert.equal(fetchCalls, 1);
    const exported = session.exportOrder();
    assert.equal(fetchCalls, 1);
    assert.equal(exported.client.handle, 'export-client');
    assert.equal(exported.review.negativeCount, 1);
    assert.equal(exported.review.reviews[0].body, 'Low confidence');
    assert.equal(JSON.stringify(exported).includes('mountTarget'), false);
    assert.deepEqual(descendants(panel).filter((node) => node.dataset?.vgenNyaUi === 'order-assistant').length, 1);
    session.unmount();
});

test('Iteration 8 L2: normalizeReviewEntries data flows through the adapter unchanged in counts', () => {
    const client = identity('entries');
    const context = normalizeReviewEntries([
        { wouldRecommend: true, reviewText: 'A' },
        { wouldRecommend: false, reviewText: 'B' },
        { wouldRecommend: false, reviewText: 'C' },
    ], client, 5, { totalReviews: 10, totalNegativeReviews: 3 });
    const order = new ExportAdapter().normalize(client, context);
    assert.equal(order.review.state, REVIEW_SOURCE_STATES.success);
    assert.equal(order.review.negativeCount, 3);
    assert.deepEqual(order.review.reviews.map((review) => review.body), ['A', 'B', 'C']);
});
