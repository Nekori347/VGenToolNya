import assert from 'node:assert/strict';
import test from 'node:test';

import { ChatConfigRepository } from '../src/chat/chat-config.js';
import { ChatAssistantRuntime } from '../src/chat/chat-assistant.js';
import { ChatDiagnostics } from '../src/chat/diagnostics.js';
import { ChatNetworkHooks } from '../src/chat/network-hooks.js';
import { ReadGate } from '../src/chat/read-gate.js';
import { StreamChatAdapter } from '../src/chat/stream-chat-adapter.js';
import { ConfigStore } from '../src/core/config-store.js';
import { FrequentClientsRuntime } from '../src/clients/frequent-clients.js';
import { CONFIG_KEYS, LEGACY_KEYS } from '../src/migration/legacy-migration.js';
import { createChatSettingsNavigation } from '../src/settings/chat-settings.js';
import { SETTINGS_NAVIGATION } from '../src/settings/navigation.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';
import { MiniDocument, descendants } from './helpers/mini-dom.js';

class FakeMutationObserver {
    static instances = [];
    constructor(callback) { this.callback = callback; this.disconnected = false; FakeMutationObserver.instances.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function repository(initial = {}) {
    return new ChatConfigRepository(new ConfigStore(new MemoryStorageDriver(initial)));
}

test('Iteration 3 L1: legacy Chat and Frequent Client data remain separated and preserve fields/order', () => {
    const repo = repository({
        [LEGACY_KEYS.toolkitSettings]: { minHeight: 300, rowHeight: 60, collapsed: true, keepUnread: true, reactionMarkRead: false },
        [LEGACY_KEYS.clients]: [
            { id: 'a', username: 'Alice', note: 'A', userID: 'ua', bannerURL: 'https://a', custom: { keep: true } },
            { id: 'b', username: 'Bob', note: 'B', userID: 'ub' },
        ],
    });
    const state = repo.read();
    assert.equal(state.chatSettings.keepUnread, true);
    assert.equal(state.clientsSettings.minHeight, 300);
    assert.deepEqual(state.clients.map((client) => client.id), ['a', 'b']);
    assert.deepEqual(state.clients[0].custom, { keep: true });
    repo.reorderClient(1, 0);
    assert.deepEqual(repo.read().clients.map((client) => client.id), ['b', 'a']);
    repo.removeClient('b');
    assert.deepEqual(repo.read().clients.map((client) => client.id), ['a']);
});

test('Iteration 3 L1: read gate blocks native read, manual release is explicit and reaction is opt-in', async () => {
    const gate = new ReadGate({ enabled: true, reactionMarkRead: false });
    gate.observeLatest('messaging:a', { id: 'm1', created_at: '2026-01-01T00:00:00Z' });
    const calls = [];
    const blocked = gate.interceptRead({ cid: 'messaging:a', body: '{}', perform: (reason) => { calls.push(reason); return 'ok'; } });
    await flush();
    assert.deepEqual(calls, []);
    assert.equal(gate.confirmReaction('messaging:a', 'm1'), 0);
    assert.deepEqual(calls, []);
    assert.equal(gate.manualRelease('messaging:a').released, 1);
    assert.equal(await blocked, 'ok');
    assert.deepEqual(calls, ['manual-click']);

    gate.confirmServerRead('messaging:a');
    gate.configure({ enabled: true, reactionMarkRead: true });
    const reacted = gate.interceptRead({ cid: 'messaging:a', body: '{}', perform: (reason) => { calls.push(reason); return reason; } });
    assert.equal(gate.confirmReaction('messaging:a', 'm1'), 1);
    assert.equal(await reacted, 'confirmed-reaction');
});

test('Iteration 3 L1: confirmed reply creates a bounded read release and newer message revokes it', async () => {
    const gate = new ReadGate({ enabled: true });
    gate.observeLatest('messaging:a', { id: 'incoming', created_at: '2026-01-01T00:00:00Z' });
    const pending = gate.interceptRead({ cid: 'messaging:a', perform: (reason) => reason });
    assert.equal(gate.confirmReply('messaging:a', { id: 'reply', created_at: '2026-01-01T00:00:01Z' }), 1);
    assert.equal(await pending, 'confirmed-reply-boundary');
    gate.observeLatest('messaging:a', { id: 'new', created_at: '2026-01-01T00:00:02Z' });
    const next = gate.interceptRead({ cid: 'messaging:a', perform: () => 'unexpected' });
    await flush();
    assert.equal(gate.pending.get('messaging:a').length, 1);
    gate.cancelAll();
    await assert.rejects(next, { name: 'AbortError' });
});

test('Iteration 3 L2: network and diagnostics hooks restore every native function', () => {
    class XHR extends EventTarget { open() {} send() {} abort() {} }
    function NativeWebSocket() {}
    function NativeEventSource() {}
    const nativeFetch = async () => ({ ok: true, status: 200, clone: () => ({ json: async () => ({}) }) });
    const windowObject = { fetch: nativeFetch, XMLHttpRequest: XHR, WebSocket: NativeWebSocket, EventSource: NativeEventSource, location: { href: 'https://vgen.co/' } };
    const originals = { open: XHR.prototype.open, send: XHR.prototype.send, abort: XHR.prototype.abort };
    const gate = new ReadGate();
    let diagnostics;
    const hooks = new ChatNetworkHooks({ windowObject, readGate: gate, onDiagnosticEvent: (event) => diagnostics.record(event) });
    diagnostics = new ChatDiagnostics({ networkHooks: hooks });
    diagnostics.start();
    assert.notEqual(windowObject.fetch, nativeFetch);
    assert.notEqual(windowObject.WebSocket, NativeWebSocket);
    assert.notEqual(windowObject.EventSource, NativeEventSource);
    assert.notEqual(XHR.prototype.open, originals.open);
    diagnostics.stop();
    assert.equal(windowObject.fetch, nativeFetch);
    assert.equal(windowObject.WebSocket, NativeWebSocket);
    assert.equal(windowObject.EventSource, NativeEventSource);
    assert.equal(XHR.prototype.open, originals.open);
    assert.equal(XHR.prototype.send, originals.send);
    assert.equal(XHR.prototype.abort, originals.abort);

    hooks.configureRead(true);
    diagnostics.start();
    diagnostics.stop();
    assert.notEqual(windowObject.fetch, nativeFetch);
    assert.equal(windowObject.WebSocket, NativeWebSocket);
    hooks.configureRead(false);
    assert.equal(windowObject.fetch, nativeFetch);
});

test('Iteration 3 L1: successful Stream reaction resolves its cid from the verified message boundary', async () => {
    const gate = new ReadGate({ enabled: true, reactionMarkRead: true });
    gate.observeLatest('messaging:a', { id: 'm1', created_at: '2026-01-01T00:00:00Z' });
    const pending = gate.interceptRead({ cid: 'messaging:a', perform: (reason) => reason });
    const nativeFetch = async () => ({ ok: true, status: 200, clone: () => ({ json: async () => ({}) }) });
    const windowObject = { fetch: nativeFetch, location: { href: 'https://vgen.co/' } };
    const hooks = new ChatNetworkHooks({ windowObject, readGate: gate });
    hooks.configureRead(true);
    await windowObject.fetch('https://chat.stream-io-api.com/messages/m1/reaction', { method: 'POST' });
    assert.equal(await pending, 'confirmed-reaction');
    hooks.dispose();
});

test('Iteration 3 L2: Chat enable/disable controls DOM observer and minimal read hook', () => {
    FakeMutationObserver.instances = [];
    const repo = repository({ [CONFIG_KEYS.chatSettings]: { enabled: false, keepUnread: true } });
    const documentObject = new MiniDocument();
    const gate = new ReadGate();
    const calls = [];
    const hooks = { configureRead: (value) => calls.push(value) };
    const runtime = new ChatAssistantRuntime({ repository: repo, readGate: gate, networkHooks: hooks, documentObject, MutationObserverClass: FakeMutationObserver });
    runtime.mount();
    assert.equal(runtime.portalObserver, null);
    assert.equal(calls.at(-1), false);
    repo.writeChatSettings({ enabled: true, keepUnread: true });
    assert.ok(runtime.portalObserver);
    assert.equal(calls.at(-1), true);
    repo.writeChatSettings({ enabled: false, keepUnread: true });
    assert.equal(runtime.portalObserver, null);
    assert.equal(calls.at(-1), false);
    runtime.unmount();
});

test('Iteration 3 L2: Overlay A to B, close and reopen keeps one session and cleans observers', () => {
    FakeMutationObserver.instances = [];
    const repo = repository({ [CONFIG_KEYS.chatSettings]: { enabled: true } });
    const documentObject = new MiniDocument();
    const gate = new ReadGate();
    const adapters = new Map();
    const runtime = new ChatAssistantRuntime({
        repository: repo,
        readGate: gate,
        networkHooks: { configureRead() {} },
        documentObject,
        MutationObserverClass: FakeMutationObserver,
        adapterFactory(surface) {
            const adapter = { cid: 'A', cleaned: 0, refresh: () => ({ cid: adapter.cid, messages: 0 }), cleanup: () => { adapter.cleaned += 1; } };
            adapters.set(surface, adapter);
            return adapter;
        },
    });
    runtime.mount();
    const bodyObserver = FakeMutationObserver.instances[0];
    const first = documentObject.createElement('div'); first.className = 'str-chat';
    const nested = documentObject.createElement('div'); nested.className = 'str-chat'; first.append(nested); documentObject.body.append(first);
    bodyObserver.callback([{ addedNodes: [first], removedNodes: [] }]);
    assert.equal(runtime.sessions.size, 1);
    const session = runtime.sessions.get(first);
    assert.equal(session.cid, 'A');
    adapters.get(first).cid = 'B';
    session.observer.callback([{ addedNodes: [], removedNodes: [] }]);
    assert.equal(session.cid, 'B');
    first.remove(); bodyObserver.callback([{ addedNodes: [], removedNodes: [first] }]);
    assert.equal(runtime.sessions.size, 0);
    assert.equal(adapters.get(first).cleaned, 1);
    const second = documentObject.createElement('div'); second.className = 'str-chat'; documentObject.body.append(second);
    bodyObserver.callback([{ addedNodes: [second], removedNodes: [] }]);
    assert.equal(runtime.sessions.size, 1);
    runtime.unmount();
    assert.equal(runtime.sessions.size, 0);
    assert.ok(FakeMutationObserver.instances.every((observer) => observer.disconnected));
});

test('Iteration 3 L2: a detached empty Chat portal releases its bounded probe immediately', () => {
    FakeMutationObserver.instances = [];
    const repo = repository({ [CONFIG_KEYS.chatSettings]: { enabled: true } });
    const documentObject = new MiniDocument();
    const runtime = new ChatAssistantRuntime({
        repository: repo,
        readGate: new ReadGate(),
        networkHooks: { configureRead() {} },
        documentObject,
        MutationObserverClass: FakeMutationObserver,
    });
    runtime.mount();
    const bodyObserver = FakeMutationObserver.instances[0];
    const portal = documentObject.createElement('div');
    portal.className = 'ReactModalPortal';
    documentObject.body.append(portal);
    bodyObserver.callback([{ addedNodes: [portal], removedNodes: [] }]);
    assert.equal(runtime.probes.size, 1);
    const probeObserver = FakeMutationObserver.instances[1];
    portal.remove();
    probeObserver.callback([{ addedNodes: [], removedNodes: [] }]);
    assert.equal(runtime.probes.size, 0);
    assert.equal(probeObserver.disconnected, true);
    runtime.unmount();
});

test('Iteration 3 L1: timestamp, seen and compact reaction render once without replacing native reaction', () => {
    const documentObject = new MiniDocument();
    const surface = documentObject.createElement('div'); surface.className = 'str-chat'; documentObject.body.append(surface);
    const group = documentObject.createElement('div'); group.className = 'str-chat__message-bubble-group';
    const element = documentObject.createElement('div'); element.className = 'str-chat__message';
    const bubble = documentObject.createElement('div'); bubble.className = 'str-chat__message-bubble';
    const reactions = documentObject.createElement('div'); reactions.className = 'str-chat__message-reactions';
    element.append(bubble); group.append(element, reactions); surface.append(group);
    const message = { id: 'm1', created_at: '2026-01-01T00:00:00Z', user: { id: 'self' } };
    const channel = { cid: 'messaging:a', getClient: () => ({ userID: 'self' }), state: { messages: [message], read: { other: { user: { id: 'other' }, last_read: '2026-01-01T00:00:01Z' } } } };
    surface['__reactProps$test'] = { channel };
    element['__reactProps$test'] = { message };
    const adapter = new StreamChatAdapter(surface, { documentObject });
    const settings = { keepUnread: true, showSeen: true, showTimestamps: true, compactReactions: true };
    adapter.refresh({ settings, readGate: new ReadGate({ enabled: true }) });
    adapter.refresh({ settings, readGate: new ReadGate({ enabled: true }) });
    assert.equal(group.querySelectorAll('.vgen-nya-chat-meta').length, 1);
    assert.equal(group.querySelector('.vgen-nya-chat-seen').textContent, '[seen]');
    assert.ok(group.querySelector('.vgen-nya-chat-time').textContent);
    assert.equal(reactions.dataset.vgenNyaCompactReactions, 'true');
    assert.equal(reactions.parentElement, group);
});

test('Iteration 3 L1: Quick Chat adapter selects an existing native Stream conversation without sending', async () => {
    const documentObject = new MiniDocument();
    const overlay = documentObject.createElement('div'); overlay.className = 'str-chat'; documentObject.body.append(overlay);
    const preview = documentObject.createElement('div'); preview.className = 'str-chat__channel-preview'; overlay.append(preview);
    const selected = [];
    const channel = { cid: 'messaging:existing', state: { members: { self: {}, target: {} } } };
    preview['__reactProps$test'] = { channel, setActiveChannel: (value) => selected.push(value) };
    const result = await StreamChatAdapter.openUser({ userID: 'target' }, { documentObject, MutationObserverClass: FakeMutationObserver });
    assert.equal(result.cid, 'messaging:existing');
    assert.deepEqual(selected, [channel]);
    assert.equal(descendants(overlay).some((node) => /send|发送/i.test(node.textContent)), false);
});

test('Iteration 3 L1: Jump to present remains an explicit native action and is never auto-invoked', () => {
    const documentObject = new MiniDocument();
    const surface = documentObject.createElement('div'); surface.className = 'str-chat'; documentObject.body.append(surface);
    const button = documentObject.createElement('button'); button.className = 'JumpToPresentButton__Anchor'; surface.append(button);
    let clicks = 0;
    button['__reactProps$test'] = { onClick: () => { clicks += 1; } };
    const adapter = new StreamChatAdapter(surface, { documentObject });
    adapter.refresh({ settings: { keepUnread: false, showSeen: true, showTimestamps: true, compactReactions: true }, readGate: new ReadGate() });
    assert.equal(clicks, 0);
    assert.equal(adapter.jumpToPresent(), true);
    assert.equal(clicks, 1);
});

test('Iteration 3 L1: Frequent Client avatar area uses the shared Chat.openUser and does not send', async () => {
    const now = Date.now();
    const repo = repository({ [CONFIG_KEYS.clients]: [{ id: 'a', username: 'Alice', userID: 'ua', profileFetchedAt: now }] });
    const documentObject = new MiniDocument();
    const host = documentObject.createElement('aside'); documentObject.body.append(host);
    const calls = [];
    const runtime = new FrequentClientsRuntime({ repository: repo, chat: { openUser: async (target) => calls.push(target) }, documentObject, MutationObserverClass: null, hostResolver: () => host, fetchImpl: async () => { throw new Error('not expected'); } });
    runtime.mount();
    const button = descendants(runtime.panel).find((node) => node.dataset.action === 'quick-chat');
    button.click();
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].userID, 'ua');
    assert.equal(descendants(runtime.panel).some((node) => /send|发送/i.test(node.textContent)), false);
    const first = runtime.panel;
    runtime.unmount();
    runtime.mount();
    assert.notEqual(runtime.panel, first);
    assert.equal(host.children.filter((node) => node.dataset.vgenNyaUi === 'frequent-clients').length, 1);
    runtime.unmount();
});

test('Iteration 3 L2: Settings IA keeps Chat, Frequent Clients and Diagnostics responsibilities separate', () => {
    const navigation = createChatSettingsNavigation(repository(), { start() {}, stop() {}, snapshot() {}, active: false, events: [] }, SETTINGS_NAVIGATION);
    assert.deepEqual(navigation.find((item) => item.id === 'chat').tabs.map((tab) => tab.id), ['display', 'read-control']);
    assert.deepEqual(navigation.find((item) => item.id === 'clients').tabs.map((tab) => tab.id), ['panel', 'management']);
    assert.deepEqual(navigation.find((item) => item.id === 'developer').tabs.map((tab) => tab.id), ['diagnostics']);
});
