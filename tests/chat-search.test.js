import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniDocument, descendants } from './helpers/mini-dom.js';
import { ChatHistoryAdapter, normalizeChatMessage } from '../src/chat/chat-history-adapter.js';
import {
    ChatSearchCache,
    ChatSearchEngine,
    makeSnippet,
    matchesQuery,
    normalizeSearchText,
    SEARCH_SOURCES,
    SEARCH_STATES,
} from '../src/chat/chat-search-engine.js';
import { ChatSearchLocator } from '../src/chat/chat-search-locator.js';
import { ChatSearchController } from '../src/chat/chat-search-ui.js';

function msg(id, text, overrides = {}) {
    return {
        id,
        text,
        created_at: overrides.created_at || '2026-01-01T00:00:00Z',
        user: { id: overrides.authorId || 'u1', name: overrides.authorName || 'User 1' },
        ...overrides,
    };
}

function norm(id, text, overrides = {}) {
    return normalizeChatMessage(msg(id, text, overrides), 'c');
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function fakeHistory({ pages = [], server = null, supportsSearch = false, loaded = [] } = {}) {
    const calls = [];
    const normalizePage = (page) => ({
        available: page?.available !== false,
        hasMore: Boolean(page?.hasMore),
        messages: (page?.messages || []).map((message) => normalizeChatMessage(message, 'c')),
    });
    return {
        calls,
        supportsServerSearch: () => supportsSearch,
        searchServer: async () => (server ? server.map((message) => normalizeChatMessage(message, 'c')) : null),
        fetchHistoryPage: async ({ before, limit }) => {
            calls.push({ before, limit });
            const page = pages.length ? pages.shift() : { available: true, messages: [], hasMore: false };
            return normalizePage(page);
        },
        loadedMessages: () => loaded.map((message) => normalizeChatMessage(message, 'c')),
    };
}

test('Iteration 7 L1: message normalization keeps search-only fields and rejects missing id', () => {
    const normalized = normalizeChatMessage({ id: 'a1', text: 'Hello world', created_at: '2026-01-01T00:00:00Z', user: { id: 'u1', name: 'Alice' } }, 'messaging:c');
    assert.equal(normalized.messageId, 'a1');
    assert.equal(normalized.cid, 'messaging:c');
    assert.equal(normalized.text, 'Hello world');
    assert.equal(normalized.authorId, 'u1');
    assert.equal(normalized.authorName, 'Alice');
    assert.equal(normalized.createdAt, '2026-01-01T00:00:00Z');
    assert.equal(normalizeChatMessage({ text: 'no id' }, 'c'), null);
    assert.equal(normalizeChatMessage(null, 'c'), null);
    assert.equal(normalizeChatMessage({ id: 'a2', body: 'body text' }, 'c').text, 'body text');
    const dated = normalizeChatMessage({ id: 'a3', text: 'x', created_at: new Date('2026-01-02T00:00:00Z') }, 'c');
    assert.equal(dated.createdAt, '2026-01-02T00:00:00.000Z');
});

test('Iteration 7 L1: query normalization and matching cover case, whitespace, Chinese and empty query', () => {
    assert.equal(normalizeSearchText('  hello   world  '), 'hello world');
    assert.equal(normalizeSearchText(''), '');
    assert.equal(matchesQuery('Hello World', 'HELLO world'), true);
    assert.equal(matchesQuery('你好世界', '你好'), true);
    assert.equal(matchesQuery('Hello  World', 'hello world'), true); // whitespace normalized
    assert.equal(matchesQuery('Hello', ''), false);
    assert.equal(matchesQuery('Hello', 'world'), false);
    assert.equal(matchesQuery('CaseSensitive', 'casesensitive'), true);
    assert.equal(makeSnippet('a'.repeat(200)), `${'a'.repeat(160)}…`);
    assert.equal(makeSnippet('short'), 'short');
});

test('Iteration 7 L1: history adapter paginates with id_lt and reports unavailable on malformed/error', async () => {
    const channel = {
        cid: 'messaging:c',
        query: async ({ messages }) => {
            if (messages.id_lt === undefined) return { messages: [msg('m3', 'third'), msg('m2', 'second'), msg('m1', 'first')] };
            if (messages.id_lt === 'm1') return { messages: [] };
            return { messages: [] };
        },
    };
    const adapter = new ChatHistoryAdapter({ channel });
    const first = await adapter.fetchHistoryPage({ limit: 3 });
    assert.equal(first.available, true);
    assert.deepEqual(first.messages.map((message) => message.messageId), ['m3', 'm2', 'm1']);
    const next = await adapter.fetchHistoryPage({ before: 'm1', limit: 3 });
    assert.equal(next.available, true);
    assert.deepEqual(next.messages, []);

    const failing = new ChatHistoryAdapter({ channel: { cid: 'c', query: async () => { throw new Error('boom'); } } });
    assert.equal((await failing.fetchHistoryPage({})).available, false);
    const malformed = new ChatHistoryAdapter({ channel: { cid: 'c', query: async () => ({ nope: true }) } });
    assert.equal((await malformed.fetchHistoryPage({})).available, false);
});

test('Iteration 7 L1: history adapter reads loaded state and server search when exposed', async () => {
    const loaded = [msg('l1', 'loaded one'), msg('l2', 'loaded two')];
    const adapter = new ChatHistoryAdapter({ channel: { cid: 'messaging:c', state: { messages: loaded } } });
    assert.deepEqual(adapter.loadedMessages().map((message) => message.messageId), ['l1', 'l2']);
    assert.equal(adapter.supportsServerSearch(), false);

    const searchable = new ChatHistoryAdapter({
        channel: {
            cid: 'messaging:c',
            search: async () => ({ results: [{ message: msg('s1', 'server result') }] }),
        },
    });
    assert.equal(searchable.supportsServerSearch(), true);
    const server = await searchable.searchServer('server');
    assert.equal(server[0].messageId, 's1');
});

test('Iteration 7 L1: bounded cache reuses pages, isolates channels and evicts LRU', () => {
    const cache = new ChatSearchCache({ maxChannels: 2, maxMessages: 3 });
    cache.record('c1', [norm('m1', 'a'), norm('m2', 'b')], { complete: false });
    assert.equal(cache.get('c1').complete, false);
    assert.equal(cache.get('c1').messages.length, 2);
    assert.equal(cache.get('c2'), null); // channel isolation
    cache.record('c2', [norm('x1', 'a')], { complete: true });
    assert.equal(cache.size, 2);
    cache.record('c3', [norm('z1', 'a')], { complete: false }); // evicts c1 (LRU)
    assert.equal(cache.size, 2);
    assert.equal(cache.get('c1'), null);
    const c4 = cache.record('c4', [norm('a', '1'), norm('b', '2'), norm('c', '3'), norm('d', '4')], { complete: false });
    assert.equal(c4.messages.length, 3); // bounded to maxMessages
    cache.clear();
    assert.equal(cache.size, 0);
});

test('Iteration 7 L1: engine prefers server search and never paginates when it hits', async () => {
    const history = fakeHistory({ supportsSearch: true, server: [msg('s1', 'server hit')] });
    const engine = new ChatSearchEngine({ cache: new ChatSearchCache() });
    const snap = await engine.search({ query: 'server', history, cid: 'messaging:c' });
    assert.equal(snap.state, SEARCH_STATES.results);
    assert.equal(snap.source, SEARCH_SOURCES.server);
    assert.deepEqual(snap.results.map((message) => message.messageId), ['s1']);
    assert.equal(history.calls.length, 0);
});

test('Iteration 7 L1: engine paginates history, matches locally and marks complete', async () => {
    const history = fakeHistory({
        pages: [
            { available: true, messages: [msg('m4', 'alpha'), msg('m3', 'Needle found')], hasMore: true },
            { available: true, messages: [msg('m2', 'beta'), msg('m1', 'hello NEEDLE')], hasMore: false },
        ],
    });
    const engine = new ChatSearchEngine({ cache: new ChatSearchCache(), pageSize: 2 });
    const snap = await engine.search({ query: 'NEEDLE', history, cid: 'c' });
    assert.equal(snap.state, SEARCH_STATES.results);
    assert.deepEqual(snap.results.map((message) => message.messageId), ['m3', 'm1']);
    assert.equal(snap.partial, false);
    assert.deepEqual(history.calls.map((call) => call.before), [null, 'm3', 'm1']);
});

test('Iteration 7 L1: engine returns empty, idle and partial states correctly', async () => {
    const noResult = new ChatSearchEngine({ cache: new ChatSearchCache() });
    const empty = await noResult.search({ query: 'zzz', history: fakeHistory({ pages: [{ available: true, messages: [msg('m1', 'hello')], hasMore: false }] }), cid: 'c' });
    assert.equal(empty.state, SEARCH_STATES.empty);
    assert.deepEqual(empty.results, []);

    const idle = await noResult.search({ query: '   ', history: fakeHistory(), cid: 'c' });
    assert.equal(idle.state, SEARCH_STATES.idle);

    // page limit reached without completing history -> partial
    const partialHistory = fakeHistory({
        pages: [
            { available: true, messages: [msg('p1', 'one'), msg('p0', 'two')], hasMore: true },
            { available: true, messages: [msg('p3', 'three'), msg('p2', 'four')], hasMore: true },
        ],
    });
    const partial = new ChatSearchEngine({ cache: new ChatSearchCache(), pageSize: 2, maxPagesPerSearch: 1 });
    const snap = await partial.search({ query: 'one', history: partialHistory, cid: 'c' });
    assert.equal(snap.state, SEARCH_STATES.results);
    assert.equal(snap.partial, true);
    assert.equal(snap.source, SEARCH_SOURCES.history);
});

test('Iteration 7 L1: engine falls back to loaded messages when pagination is unavailable', async () => {
    const history = fakeHistory({
        pages: [{ available: false, messages: [], hasMore: false }],
        loaded: [msg('l1', 'Loaded needle'), msg('l2', 'other')],
    });
    const engine = new ChatSearchEngine({ cache: new ChatSearchCache() });
    const snap = await engine.search({ query: 'needle', history, cid: 'c' });
    assert.equal(snap.source, SEARCH_SOURCES.loaded);
    assert.equal(snap.partial, true);
    assert.deepEqual(snap.results.map((message) => message.messageId), ['l1']);
});

test('Iteration 7 L1: a stale query can never overwrite a newer query result', async () => {
    const resolvers = [];
    const history = {
        supportsServerSearch: () => false,
        searchServer: async () => null,
        fetchHistoryPage: async () => new Promise((resolve) => resolvers.push(resolve)),
        loadedMessages: () => [],
    };
    const engine = new ChatSearchEngine({ cache: new ChatSearchCache() });
    const promiseA = engine.search({ query: 'a', history, cid: 'c' });
    const promiseB = engine.search({ query: 'b', history, cid: 'c' });
    resolvers[1]({ available: true, messages: [norm('mb', 'B result')], hasMore: false });
    const snapB = await promiseB;
    assert.equal(snapB.results[0].messageId, 'mb');
    resolvers[0]({ available: true, messages: [norm('ma', 'A result')], hasMore: false });
    await promiseA;
    assert.equal(engine.snapshot.results[0].messageId, 'mb'); // A did not overwrite B
});

test('Iteration 7 L1: locator finds, highlights and loads historical messages', async () => {
    const documentObject = new MiniDocument();
    const surface = documentObject.createElement('div');
    documentObject.body.append(surface);
    const loaded = documentObject.createElement('div');
    loaded.dataset.messageId = 'm1';
    surface.append(loaded);

    const locator = new ChatSearchLocator({ surface, documentObject });
    assert.equal(locator.findElement('m1'), loaded);
    assert.equal(locator.findElement('missing'), null);

    // Historical target reached through the loader.
    const loads = [];
    const loader = async () => {
        loads.push(1);
        const older = documentObject.createElement('div');
        older.dataset.messageId = 'm0';
        surface.append(older);
        return loads.length < 2;
    };
    const result = await locator.locateOrLoad('m0', { loader, maxLoads: 3 });
    assert.equal(result.found, true);
    assert.equal(result.loads, 1);
    assert.equal(locator.findElement('m0') !== null, true);

    // Missing message never found.
    const missing = await locator.locateOrLoad('nope', { loader: async () => false, maxLoads: 3 });
    assert.equal(missing.found, false);
    locator.clearHighlights();
});

function makeController({ channel, documentObject = new MiniDocument() } = {}) {
    const surface = documentObject.createElement('div');
    documentObject.body.append(surface);
    const adapter = { findChannel: () => channel, refresh: () => ({ cid: channel?.cid || null, messages: 0 }), cleanup: () => {} };
    const controller = new ChatSearchController({
        surface,
        adapter,
        documentObject,
        historyAdapterFactory: (ch) => new ChatHistoryAdapter({ channel: ch }),
        debounceMs: 0,
    });
    controller.mount();
    return { controller, surface, documentObject, adapter };
}

function buttons(root) {
    return descendants(root).filter((node) => node.tagName === 'BUTTON');
}

test('Iteration 7 L2 A: search a conversation, get results, click a result to locate', async () => {
    const documentObject = new MiniDocument();
    const channel = {
        cid: 'messaging:c',
        state: { messages: [], loadMore: async () => false },
        query: async ({ messages }) => {
            if (messages.id_lt === undefined) return { messages: [msg('m2', 'second note'), msg('m1', 'Needle target')] };
            return { messages: [] };
        },
    };
    const { controller, surface } = makeController({ channel, documentObject });
    controller.input.value = 'needle';
    buttons(controller.root).find((button) => button.dataset.action === 'search').click();
    await flush();
    await flush();
    const results = buttons(controller.root).filter((button) => button.dataset.action === 'locate');
    assert.equal(results.length, 1);
    const snippet = descendants(results[0]).find((node) => node.className === 'vgen-nya-chat-search__result-snippet');
    assert.equal(snippet.textContent, 'Needle target');
    results[0].click();
    await flush();
    controller.unmount();
});

test('Iteration 7 L2 B: changing the query during fetch ignores the stale result', async () => {
    const resolvers = [];
    const channel = {
        cid: 'messaging:c',
        state: { messages: [] },
        query: async () => new Promise((resolve) => resolvers.push(resolve)),
    };
    const { controller } = makeController({ channel });
    controller.input.value = 'first';
    buttons(controller.root).find((button) => button.dataset.action === 'search').click();
    controller.input.value = 'second';
    buttons(controller.root).find((button) => button.dataset.action === 'search').click();
    resolvers[1]({ messages: [msg('m2', 'second result')] });
    await flush();
    await flush();
    resolvers[0]({ messages: [msg('m1', 'first result')] });
    await flush();
    const snippets = descendants(controller.root).filter((node) => node.className === 'vgen-nya-chat-search__result-snippet').map((node) => node.textContent);
    assert.deepEqual(snippets, ['second result']);
    controller.unmount();
});

test('Iteration 7 L2 C: switching channel aborts the old search and resets state', async () => {
    const channelA = { cid: 'messaging:a', state: { messages: [] }, query: async () => new Promise(() => {}) };
    const channelB = { cid: 'messaging:b', state: { messages: [] }, query: async () => ({ messages: [msg('b1', 'B result')] }) };
    let current = channelA;
    const documentObject = new MiniDocument();
    const surface = documentObject.createElement('div');
    documentObject.body.append(surface);
    const adapter = { findChannel: () => current, refresh: () => ({ cid: current.cid, messages: 0 }), cleanup: () => {} };
    const controller = new ChatSearchController({ surface, adapter, documentObject, historyAdapterFactory: (ch) => new ChatHistoryAdapter({ channel: ch }), debounceMs: 0 });
    controller.mount();
    controller.input.value = 'query';
    buttons(controller.root).find((button) => button.dataset.action === 'search').click();
    await flush();
    // switch to B
    current = channelB;
    controller.refresh();
    controller.input.value = 'result';
    buttons(controller.root).find((button) => button.dataset.action === 'search').click();
    await flush();
    const snippets = descendants(controller.root).filter((node) => node.className === 'vgen-nya-chat-search__result-snippet').map((node) => node.textContent);
    assert.deepEqual(snippets, ['B result']);
    controller.unmount();
});

test('Iteration 7 L2 D: close cleans up and reopen starts with a clean single UI', () => {
    const documentObject = new MiniDocument();
    const channel = { cid: 'messaging:c', state: { messages: [] }, query: async () => ({ messages: [] }) };
    const { controller, surface } = makeController({ channel, documentObject });
    const count = () => descendants(documentObject.body).filter((node) => node.dataset.vgenNyaUi === 'chat-search').length;
    assert.equal(count(), 1);
    controller.unmount();
    assert.equal(count(), 0);
    controller.mount();
    assert.equal(count(), 1);
    controller.unmount();
});

test('Iteration 7 L2 E: repeated searches reuse cached pages without refetching', async () => {
    const calls = [];
    const channel = {
        cid: 'messaging:c',
        state: { messages: [] },
        query: async ({ messages }) => {
            calls.push(messages.id_lt);
            if (messages.id_lt === undefined) return { messages: [msg('m2', 'alpha beta'), msg('m1', 'gamma')] };
            return { messages: [] };
        },
    };
    const { controller } = makeController({ channel });
    controller.input.value = 'alpha';
    buttons(controller.root).find((button) => button.dataset.action === 'search').click();
    await flush();
    await flush();
    controller.input.value = 'gamma';
    buttons(controller.root).find((button) => button.dataset.action === 'search').click();
    await flush();
    await flush();
    const snippets = descendants(controller.root).filter((node) => node.className === 'vgen-nya-chat-search__result-snippet').map((node) => node.textContent);
    assert.deepEqual(snippets, ['gamma']);
    assert.deepEqual(calls, [undefined]); // second query reuses cached pages
    controller.unmount();
});

test('Iteration 7 L3: idle controller performs no history fetch', async () => {
    const calls = [];
    const channel = {
        cid: 'messaging:c',
        state: { messages: [] },
        query: async () => { calls.push(1); return { messages: [] }; },
    };
    const { controller } = makeController({ channel });
    await flush();
    assert.equal(calls.length, 0); // mounting does not fetch
    controller.unmount();
});
