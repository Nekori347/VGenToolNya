import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniDocument, descendants } from './helpers/mini-dom.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';
import { ConfigStore } from '../src/core/config-store.js';
import { Clipboard } from '../src/core/clipboard.js';
import { OrderConfigRepository } from '../src/order/order-config.js';
import {
    canonicalProfileUrl,
    ClientReviewAdapter,
    normalizePublicHandle,
    normalizePublicReview,
    normalizeReviewContext,
    resolvePublicClientIdentity,
    REVIEW_SOURCE_STATES,
} from '../src/order/client-review-adapter.js';
import {
    ClientBackgroundCache,
    CLIENT_BACKGROUND_ERROR_TTL_MS,
    CLIENT_BACKGROUND_TTL_MS,
} from '../src/order/client-background-cache.js';
import { OrderAssistantRuntime, OrderAssistantSession } from '../src/order/order-assistant.js';
import { OrderDetailLifecycle } from '../src/order/order-detail-lifecycle.js';

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

test('Iteration 5 L1: public review normalization distinguishes five-star, low, empty and malformed data', () => {
    const client = identity('client-a');
    const five = normalizeReviewContext({ reviews: [{ rating: 5, body: 'Great client' }] }, client, 10);
    assert.equal(five.state, REVIEW_SOURCE_STATES.success);
    assert.equal(five.lowRatingReviews.length, 0);

    const oneLow = normalizeReviewContext({ reviews: [{ rating: 5, body: 'A' }, { rating: 4, body: 'B' }] }, client, 11);
    assert.deepEqual(oneLow.lowRatingReviews.map((review) => review.rating), [4]);
    const multiple = normalizeReviewContext({ reviews: [{ score: 3, text: 'C' }, { stars: 2, comment: 'D' }] }, client, 12);
    assert.deepEqual(multiple.lowRatingReviews.map((review) => review.rating), [3, 2]);

    assert.equal(normalizeReviewContext({ reviews: [] }, client).state, REVIEW_SOURCE_STATES.empty);
    assert.equal(normalizeReviewContext({ somethingElse: [] }, client).state, REVIEW_SOURCE_STATES.unavailable);
    assert.equal(normalizeReviewContext({ reviews: [{ rating: 'bad', body: '' }] }, client).state, REVIEW_SOURCE_STATES.unavailable);
    assert.equal(normalizeReviewContext({ reviews: [{ rating: 5, body: 'Valid' }, { rating: 'bad', body: '' }] }, client).state, REVIEW_SOURCE_STATES.unavailable);
    assert.equal(normalizePublicReview({ rating: 4, body: 'Keep exact body', reviewer: 'Anonymous' }).body, 'Keep exact body');
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
    assert.equal(result.lowRatingReviews.length, 1);
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

test('Iteration 5 L2: warning, selectable review popover and copy work without a false safe state', async () => {
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
    const warning = buttons(session.root).find((button) => button.dataset.action === 'toggle-reviews');
    assert.match(warning.textContent, /1 条/);
    warning.click();
    assert.equal(session.popover.hidden, false);
    const body = descendants(session.popover).find((node) => node.className === 'vgen-nya-order-assistant__review-body');
    assert.equal(body.textContent, 'Selectable review body');
    assert.equal(body.translate, true);
    buttons(session.popover).find((button) => button.dataset.action === 'copy-review').click();
    await Promise.resolve();
    assert.deepEqual(writes, ['Selectable review body']);

    session.result = normalizeReviewContext({ reviews: [{ rating: 5, body: 'Five only' }] }, session.identity);
    session.render();
    assert.equal(buttons(session.root).some((button) => /存在/.test(button.textContent)), false);
    session.result = { state: REVIEW_SOURCE_STATES.error, reviews: [], lowRatingReviews: [] };
    session.render();
    assert.match(session.root.textContent + descendants(session.root).map((node) => node.textContent).join(' '), /加载失败/);
    assert.doesNotMatch(session.root.textContent, /没有低星|均为 5/);
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
    const assistantCount = () => descendants(documentObject.body).filter((node) => node.dataset.vgenNyaUi === 'order-assistant').length;
    assert.equal(assistantCount(), 1);
    lifecycle.emit({ type: 'change', panel, identity: identity('b', panel) });
    assert.equal(assistantCount(), 1);
    repository.write({ copyButtons: false, clientBackground: false });
    assert.equal(assistantCount(), 0);
    runtime.unmount();
    assert.equal(listeners.size, 0);
});
