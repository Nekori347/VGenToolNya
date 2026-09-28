import assert from 'node:assert/strict';
import test from 'node:test';

import { ChatAssistantSession } from '../src/chat/chat-assistant.js';
import { ConfigStore } from '../src/core/config-store.js';
import { CONFIG_KEYS } from '../src/migration/legacy-migration.js';
import { FinalDeliveryTarget, OrderTextPresetRuntime } from '../src/order/order-text-presets.js';
import { ChatQuickReplyPresetAdapter } from '../src/presets/adapters/chat-quick-reply.js';
import { FinalDeliveryPresetAdapter } from '../src/presets/adapters/final-delivery.js';
import { PrivateNotePresetAdapter } from '../src/presets/adapters/private-note.js';
import { UploadDescriptionPresetAdapter } from '../src/presets/adapters/upload-description.js';
import { UploadTitlePresetAdapter } from '../src/presets/adapters/upload-title.js';
import { TextPresetContextRegistry, TEXT_PRESET_CONTEXTS } from '../src/presets/context-registry.js';
import { NativeTextTarget } from '../src/presets/native-text-target.js';
import { TextPresetEngine } from '../src/presets/text-preset-engine.js';
import { TextPresetStore } from '../src/presets/text-preset-store.js';
import { UploadAssistantSession } from '../src/upload/upload-assistant.js';
import { UploadConfigRepository } from '../src/upload/upload-config.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';
import { MiniDocument, descendants } from './helpers/mini-dom.js';

function setup(entries = {}, ids = ['generated'], suppliedDriver = null) {
    const driver = suppliedDriver || new MemoryStorageDriver(entries);
    const store = new ConfigStore(driver);
    const uploadRepository = new UploadConfigRepository(store);
    const presetStore = new TextPresetStore({ store, uploadRepository });
    const registry = new TextPresetContextRegistry();
    registry.register(TEXT_PRESET_CONTEXTS.uploadTitle, new UploadTitlePresetAdapter());
    registry.register(TEXT_PRESET_CONTEXTS.uploadDescription, new UploadDescriptionPresetAdapter());
    registry.register(TEXT_PRESET_CONTEXTS.chatQuickReply, new ChatQuickReplyPresetAdapter());
    registry.register(TEXT_PRESET_CONTEXTS.privateNote, new PrivateNotePresetAdapter());
    registry.register(TEXT_PRESET_CONTEXTS.finalDelivery, new FinalDeliveryPresetAdapter());
    let index = 0;
    const engine = new TextPresetEngine({ store: presetStore, registry, idFactory: () => ids[index++] || `generated-${index}` });
    return { driver, store, uploadRepository, presetStore, registry, engine };
}

test('Iteration 4 L1: Text Preset Engine CRUD, sorting, duplicate protection and context isolation', () => {
    const { engine, driver } = setup({}, ['a', 'b', 'c']);
    const quick = TEXT_PRESET_CONTEXTS.chatQuickReply;
    const note = TEXT_PRESET_CONTEXTS.privateNote;
    engine.create(quick, { name: 'First', payload: 'one' });
    engine.create(quick, { name: 'Second', payload: 'two' });
    engine.create(note, { name: 'Private', payload: 'note' });
    engine.update(quick, 'a', { name: 'First edited', payload: 'ONE' });
    assert.deepEqual(engine.list(quick).map((item) => [item.id, item.name, item.value]), [['a', 'First edited', 'ONE'], ['b', 'Second', 'two']]);
    engine.reorder(quick, 1, 0);
    assert.deepEqual(engine.list(quick).map((item) => item.id), ['b', 'a']);
    assert.equal(engine.delete(quick, 'a'), true);
    assert.deepEqual(engine.list(quick).map((item) => item.id), ['b']);
    assert.deepEqual(engine.list(note).map((item) => item.id), ['c']);
    assert.throws(() => engine.create(quick, { id: 'b', name: 'Duplicate', payload: 'x' }), /unique/);
    assert.notEqual(CONFIG_KEYS.chatQuickReplyPresets, CONFIG_KEYS.privateNotePresets);
    assert.equal(driver.hasValue(CONFIG_KEYS.finalDeliveryPresets), false);
});

test('Iteration 4 L1: invalid stored items recover read-only without rewriting source data', () => {
    const raw = [{ id: 'ok', name: 'OK', value: 'safe', extra: { keep: true } }, { id: 'ok', name: 'Duplicate', value: 'duplicate' }, { id: '', name: 'Broken', value: 'x' }, null];
    const { engine, driver } = setup({ [CONFIG_KEYS.chatQuickReplyPresets]: raw });
    const beforeWrites = driver.writes.length;
    assert.deepEqual(engine.list(TEXT_PRESET_CONTEXTS.chatQuickReply), [{ id: 'ok', name: 'OK', value: 'safe', extra: { keep: true } }]);
    assert.equal(driver.writes.length, beforeWrites);
    assert.deepEqual(driver.getValue(CONFIG_KEYS.chatQuickReplyPresets), raw);
    assert.throws(() => engine.create(TEXT_PRESET_CONTEXTS.chatQuickReply, { name: 'New', payload: 'new' }), /left unchanged/);
    assert.deepEqual(driver.getValue(CONFIG_KEYS.chatQuickReplyPresets), raw);
});

test('Iteration 4 L1: a non-array corrupt collection remains untouched and blocks create/import', () => {
    const key = CONFIG_KEYS.privateNotePresets;
    const corrupt = { unexpected: 'keep-original' };
    const { engine, driver } = setup({ [key]: corrupt });
    const beforeWrites = driver.writes.length;
    assert.deepEqual(engine.list(TEXT_PRESET_CONTEXTS.privateNote), []);
    assert.throws(() => engine.create(TEXT_PRESET_CONTEXTS.privateNote, { name: 'Unsafe overwrite', payload: 'x' }), /left unchanged/);
    const document = { schema: 'vgen-nya.text-presets', version: 1, context: TEXT_PRESET_CONTEXTS.privateNote,
        exportedAt: '2026-09-28T00:00:00.000Z', presets: [{ id: 'new', name: 'New', value: 'new' }] };
    const plan = engine.prepareImport(document);
    assert.throws(() => engine.commitImport(plan, { confirmed: true }), /left unchanged/);
    assert.equal(driver.writes.length, beforeWrites);
    assert.deepEqual(driver.getValue(key), corrupt);
});

test('Iteration 4 L1: context export/import validates schema, requires confirmation and preserves fields', () => {
    const context = TEXT_PRESET_CONTEXTS.chatQuickReply;
    const source = setup({ [CONFIG_KEYS.chatQuickReplyPresets]: [{ id: 'x', name: 'X', value: 'text', custom: { keep: true } }] });
    const document = source.engine.exportDocument(context, '2026-09-28T00:00:00.000Z');
    const target = setup({ [CONFIG_KEYS.chatQuickReplyPresets]: [{ id: 'old', name: 'Old', value: 'old' }] });
    const plan = target.engine.prepareImport(JSON.stringify(document));
    assert.throws(() => target.engine.commitImport(plan), /confirmation/);
    target.engine.commitImport(plan, { confirmed: true });
    assert.deepEqual(target.engine.list(context), source.engine.list(context));
    assert.throws(() => target.engine.prepareImport({ ...document, context: 'unknown' }), /not registered/);
});

test('Iteration 4 L1: failed import restores the complete previous collection', () => {
    class FailingDriver extends MemoryStorageDriver {
        setValue(key, value) {
            super.setValue(key, value);
            if (this.failNext) { this.failNext = false; throw new Error('simulated write failure'); }
        }
    }
    const key = CONFIG_KEYS.privateNotePresets;
    const previous = [{ id: 'old', name: 'Old', value: 'safe' }];
    const driver = new FailingDriver({ [key]: previous });
    const { engine } = setup({}, ['x'], driver);
    const document = { schema: 'vgen-nya.text-presets', version: 1, context: TEXT_PRESET_CONTEXTS.privateNote, exportedAt: '2026-09-28T00:00:00.000Z', presets: [{ id: 'new', name: 'New', value: 'new' }] };
    const plan = engine.prepareImport(document);
    driver.failNext = true;
    assert.throws(() => engine.commitImport(plan, { confirmed: true }), /restored/);
    assert.deepEqual(driver.getValue(key), previous);
});

test('Iteration 4 L1: existing Title data and exact Description Slate payload remain unchanged', async () => {
    const slate = '[{"type":"paragraph","children":[{"text":"Exact Slate"}],"custom":{"keep":true}}]';
    const title = { id: 'title', name: 'Legacy title', value: 'Hello', custom: 1 };
    const description = { id: 'description', name: 'Legacy description', value: slate, custom: 2 };
    const { engine, driver } = setup({ [CONFIG_KEYS.titlePresets]: [title], [CONFIG_KEYS.descriptionPresets]: [description] });
    const calls = [];
    const target = { applyText: async (kind, value) => calls.push([kind, value]) };
    await engine.select(TEXT_PRESET_CONTEXTS.uploadTitle, 'title', target);
    await engine.select(TEXT_PRESET_CONTEXTS.uploadDescription, 'description', target);
    assert.deepEqual(calls, [['title', 'Hello'], ['description', slate]]);
    assert.deepEqual(driver.getValue(CONFIG_KEYS.titlePresets), [title]);
    assert.deepEqual(driver.getValue(CONFIG_KEYS.descriptionPresets), [description]);
    assert.match(engine.preview(TEXT_PRESET_CONTEXTS.uploadDescription, 'description'), /Exact Slate/);
});

test('Iteration 4 L1: Quick Reply protects non-empty composer and never invokes send', async () => {
    const { engine } = setup({ [CONFIG_KEYS.chatQuickReplyPresets]: [{ id: 'reply', name: 'Reply', value: 'Hello there' }] });
    let value = '';
    let sends = 0;
    const target = {
        async fillComposer(text, { replace = false } = {}) {
            if (value && !replace) return { status: 'requires-confirmation', current: value };
            value = text; return { status: 'filled' };
        },
        sendMessage() { sends += 1; },
    };
    assert.equal((await engine.select(TEXT_PRESET_CONTEXTS.chatQuickReply, 'reply', target)).status, 'filled');
    assert.equal(value, 'Hello there');
    value = 'manual draft';
    assert.equal((await engine.select(TEXT_PRESET_CONTEXTS.chatQuickReply, 'reply', target)).status, 'requires-confirmation');
    assert.equal(value, 'manual draft');
    await engine.select(TEXT_PRESET_CONTEXTS.chatQuickReply, 'reply', target, { replace: true });
    assert.equal(value, 'Hello there');
    assert.equal(sends, 0);
});

test('Iteration 4 L1: Private Note and Final Delivery adapters fill only without save or delivery', async () => {
    const { engine } = setup({
        [CONFIG_KEYS.privateNotePresets]: [{ id: 'note', name: 'Note', value: 'private' }],
        [CONFIG_KEYS.finalDeliveryPresets]: [{ id: 'delivery', name: 'Delivery', value: 'delivered text' }],
    });
    const calls = [];
    const noteTarget = { fillPrivateNote: async (value) => calls.push(['fill-note', value]), save: () => calls.push(['save']) };
    const deliveryTarget = { fillFinalDelivery: async (value) => calls.push(['fill-delivery', value]), deliver: () => calls.push(['deliver']) };
    await engine.select(TEXT_PRESET_CONTEXTS.privateNote, 'note', noteTarget);
    await engine.select(TEXT_PRESET_CONTEXTS.finalDelivery, 'delivery', deliveryTarget);
    assert.deepEqual(calls, [['fill-note', 'private'], ['fill-delivery', 'delivered text']]);
});

test('Iteration 4 L2: Upload Title, Description and Combination retain behavior across remount', async () => {
    const slate = '[{"type":"paragraph","children":[{"text":"Slate"}]}]';
    const { engine, uploadRepository } = setup({
        [CONFIG_KEYS.titlePresets]: [{ id: 't', name: 'Title', value: 'T' }],
        [CONFIG_KEYS.descriptionPresets]: [{ id: 'd', name: 'Description', value: slate }],
        [CONFIG_KEYS.combinationPresets]: [{ id: 'c', name: 'Combination', title: 'CT', description: slate, discoveryValues: {}, tags: [] }],
    });
    const documentObject = new MiniDocument();
    const surface = documentObject.createElement('div'); documentObject.body.append(surface);
    const state = { title: '', description: '', tags: [], tagLimit: 20 };
    const adapter = { read: () => structuredClone(state), applyText: async (kind, value) => { state[kind] = value; }, applyCombination: async (preset) => { state.title = preset.title; state.description = preset.description; }, findTagInput: () => null };
    const first = new UploadAssistantSession({ surface, repository: uploadRepository, textPresetEngine: engine, adapter, MutationObserverClass: null });
    first.mount();
    await engine.select(TEXT_PRESET_CONTEXTS.uploadTitle, 't', adapter);
    await engine.select(TEXT_PRESET_CONTEXTS.uploadDescription, 'd', adapter);
    await adapter.applyCombination(uploadRepository.read().combinationPresets[0]);
    first.unmount();
    const second = new UploadAssistantSession({ surface, repository: uploadRepository, textPresetEngine: engine, adapter, MutationObserverClass: null });
    second.mount();
    assert.equal(descendants(surface).filter((node) => node.dataset.vgenNyaUi === 'upload-assistant').length, 1);
    assert.deepEqual(state, { title: 'CT', description: slate, tags: [], tagLimit: 20 });
    second.unmount();
});

test('Iteration 4 L2: Chat Quick Reply UI follows composer replacement and cleans up without sending', () => {
    const { engine } = setup({ [CONFIG_KEYS.chatQuickReplyPresets]: [{ id: 'q', name: 'Quick', value: 'text' }] });
    const documentObject = new MiniDocument();
    const surface = documentObject.createElement('div'); const hostA = documentObject.createElement('div'); const hostB = documentObject.createElement('div');
    const composerA = documentObject.createElement('textarea'); const composerB = documentObject.createElement('textarea'); hostA.append(composerA); hostB.append(composerB); surface.append(hostA, hostB); documentObject.body.append(surface);
    let composer = composerA; let sends = 0;
    const adapter = { refresh: () => ({ cid: 'messaging:test' }), findComposer: () => composer, fillComposer: async () => ({ status: 'filled' }), cleanup() {}, sendMessage() { sends += 1; } };
    const session = new ChatAssistantSession({ surface, repository: { read: () => ({ chatSettings: {} }) }, readGate: {}, adapter, textPresetEngine: engine, MutationObserverClass: null });
    session.mount();
    assert.equal(descendants(hostA).filter((node) => node.dataset.vgenNyaUi === 'quick-replies').length, 1);
    composer = composerB; session.refresh();
    assert.equal(descendants(hostA).filter((node) => node.dataset.vgenNyaUi === 'quick-replies').length, 0);
    assert.equal(descendants(hostB).filter((node) => node.dataset.vgenNyaUi === 'quick-replies').length, 1);
    session.unmount();
    assert.equal(descendants(surface).filter((node) => node.dataset.vgenNyaUi === 'quick-replies').length, 0);
    assert.equal(sends, 0);
});

test('Iteration 4 L2: Order Note runtime mounts on scoped target, follows removal and uses no subtree observer', () => {
    class Observer { constructor(callback) { this.callback = callback; } observe(target, options) { this.target = target; this.options = options; } disconnect() { this.disconnected = true; } }
    const { engine } = setup({ [CONFIG_KEYS.privateNotePresets]: [{ id: 'n', name: 'Note', value: 'text' }] });
    const documentObject = new MiniDocument();
    const wrapper = documentObject.createElement('div'); const input = documentObject.createElement('textarea'); input.value = ''; wrapper.append(input); documentObject.body.append(wrapper);
    const runtime = new OrderTextPresetRuntime({ engine, documentObject, MutationObserverClass: Observer, noteResolver: (root) => root === documentObject || root === wrapper ? [input] : [] });
    runtime.mount();
    assert.equal(runtime.mount(), false);
    assert.deepEqual(runtime.observer.options, { childList: true });
    assert.equal(runtime.sessions.size, 1);
    wrapper.remove(); runtime.releaseRemoved(wrapper);
    assert.equal(runtime.sessions.size, 0);
    runtime.unmount();
    assert.equal(runtime.observer, null);
    assert.equal(descendants(documentObject.body).filter((node) => node.dataset.vgenNyaUi === 'order-preset-style').length, 0);
});

test('Iteration 4 L1: Native text and Final Delivery targets change input state without submit semantics', async () => {
    const documentObject = new MiniDocument();
    const input = documentObject.createElement('textarea'); input.value = '';
    let submits = 0; input.submit = () => { submits += 1; };
    const native = new NativeTextTarget(input);
    await native.fillText('draft');
    assert.equal(input.value, 'draft');
    const delivery = new FinalDeliveryTarget(input);
    assert.equal((await delivery.fillFinalDelivery('other')).status, 'requires-confirmation');
    await delivery.fillFinalDelivery('other', { replace: true });
    assert.equal(input.value, 'other');
    assert.equal(submits, 0);
});
