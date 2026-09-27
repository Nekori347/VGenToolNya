import assert from 'node:assert/strict';
import test from 'node:test';

import { ConfigStore } from '../src/core/config-store.js';
import { CONFIG_KEYS, LEGACY_KEYS } from '../src/migration/legacy-migration.js';
import { UploadAssistantRuntime, UploadAssistantSession } from '../src/upload/upload-assistant.js';
import { DAILY_PRESET_FORMAT, UploadConfigRepository } from '../src/upload/upload-config.js';
import { VGenUploadAdapter } from '../src/upload/vgen-upload-adapter.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';
import { MiniDocument, descendants } from './helpers/mini-dom.js';

function fixtureDriver() {
    return new MemoryStorageDriver({
        [CONFIG_KEYS.combinationPresets]: [{ id: 'all', name: 'All', title: 'T', description: '[{"type":"p","children":[{"text":"D"}]}]', discoveryValues: { a: ['x'] }, tags: ['one'] }],
        [CONFIG_KEYS.titlePresets]: [{ id: 't', name: 'Title', value: 'Hello' }],
        [CONFIG_KEYS.descriptionPresets]: [{ id: 'd', name: 'Description', value: '[{"type":"p","children":[{"text":"Slate"}]}]' }],
        [CONFIG_KEYS.discoveryPresets]: [{ id: 'v', name: 'Discovery', schema: [{ optionID: 'a', allowMultipleSelections: true }], values: { a: ['x', 'y'] } }],
        [CONFIG_KEYS.searchTagGroups]: [{ id: 'g', name: 'Group', tags: [{ tag: 'one', note: 'note' }, { tag: 'two', note: '' }] }],
        [CONFIG_KEYS.uploadSettings]: { collapsed: false, groupExpanded: { g: true }, modules: { global: true, title: true, description: true, discovery: true, tags: true }, autoCollapseDiscovery: true },
        [CONFIG_KEYS.uiSettings]: { theme: 'dark' },
    });
}

class FakeAdapter {
    constructor() { this.state = { title: '', description: '', discoveryValues: [], tags: [], tagLimit: 20 }; }
    findTagInput() { return null; }
    read() { return structuredClone(this.state); }
    async setTags(tags) { this.state.tags = [...tags]; }
    async applyText(kind, value) { this.state[kind] = value; }
    async applyDiscovery(preset) { this.state.discoveryValues = structuredClone(preset.values); }
    async applyCombination(preset) { this.state = { ...this.state, title: preset.title, description: preset.description, discoveryValues: structuredClone(preset.discoveryValues), tags: [...preset.tags] }; }
}

test('Iteration 2 L1: repository preserves separated schemas, order, Slate JSON and tag notes', () => {
    const repository = new UploadConfigRepository(new ConfigStore(fixtureDriver()));
    const snapshot = repository.read();
    assert.deepEqual(snapshot.searchTagGroups[0].tags[0], { tag: 'one', note: 'note' });
    assert.match(snapshot.descriptionPresets[0].value, /Slate/);
    assert.deepEqual(snapshot.discoveryPresets[0].values.a, ['x', 'y']);
    repository.writeDomain('titlePresets', [snapshot.titlePresets[0], { id: 't2', name: 'Second', value: '2' }]);
    assert.deepEqual(repository.read().titlePresets.map((item) => item.id), ['t', 't2']);
});

test('Iteration 2 L1: refresh only rereads Upload config and notifies mounted consumers', () => {
    const driver = fixtureDriver();
    const repository = new UploadConfigRepository(new ConfigStore(driver));
    let notifications = 0;
    repository.subscribe(() => { notifications += 1; });
    repository.read();
    driver.setValue(CONFIG_KEYS.titlePresets, [{ id: 'external', name: 'Other tab', value: 'new' }]);
    assert.equal(repository.refresh().titlePresets[0].id, 'external');
    assert.equal(notifications, 1);
});

test('Iteration 2 L1: daily preset import is distinct from Legacy Migration and rolls back on failure', () => {
    const driver = fixtureDriver();
    const repository = new UploadConfigRepository(new ConfigStore(driver));
    const exported = repository.exportDaily('2026-09-27T00:00:00.000Z');
    assert.equal(exported.format, DAILY_PRESET_FORMAT);
    assert.notEqual(exported.format, 'vgen-nya.legacy-export');
    const plan = repository.prepareDailyImport(JSON.stringify(exported));
    assert.equal(plan.counts.searchTagGroups, 1);
    assert.throws(() => repository.commitDailyImport(plan), /confirmation/);

    const before = repository.read();
    const originalSet = driver.setValue.bind(driver);
    let writes = 0;
    driver.setValue = (key, value) => { writes += 1; if (writes === 3) throw new Error('injected'); originalSet(key, value); };
    assert.throws(() => repository.commitDailyImport(plan, { confirmed: true }), /restored/);
    driver.setValue = originalSet;
    assert.deepEqual(repository.read(), before);
});

test('Iteration 2 L1: v0.9 daily export imports without mixing it with Legacy Migration envelopes', () => {
    const repository = new UploadConfigRepository(new ConfigStore(fixtureDriver()));
    const plan = repository.prepareDailyImport(JSON.stringify({
        type: 'vgen-quick-presets', version: 9, exportedAt: '2026-09-27T00:00:00.000Z',
        groups: [{ id: 'legacy', name: 'Legacy', tags: [{ tag: 'old', note: 'kept' }] }],
        copyPresets: { title: [{ id: 'lt', name: 'LT', value: 'legacy' }], description: repository.read().descriptionPresets },
        discoveryPresets: repository.read().discoveryPresets,
        globalPresets: repository.read().combinationPresets,
        settings: { modules: { tags: false }, autoCollapseDiscovery: false },
    }));
    assert.equal(plan.source.format, 'vgen-quick-presets');
    assert.equal(plan.payload.searchTagGroups[0].tags[0].note, 'kept');
    assert.equal(plan.payload.uploadSettings.modules.tags, false);
    assert.equal(plan.payload.uploadSettings.autoCollapseDiscovery, false);
});

test('Iteration 2 L1/L2: session applies each preset kind and tag toggles without duplicate mount', async () => {
    const documentObject = new MiniDocument();
    const surface = documentObject.createElement('div');
    documentObject.body.append(surface);
    const repository = new UploadConfigRepository(new ConfigStore(fixtureDriver()));
    const adapter = new FakeAdapter();
    const session = new UploadAssistantSession({ surface, repository, adapter, MutationObserverClass: null });
    assert.equal(session.mount(), true);
    assert.equal(session.mount(), false);
    assert.equal(descendants(surface).filter((node) => node.dataset.vgenNyaUi === 'upload-assistant').length, 1);

    const select = (kind) => descendants(session.root).find((node) => node.tagName === 'SELECT' && node.dataset.kind === kind);
    for (const [kind, value] of [['title', 't'], ['description', 'd'], ['discovery', 'v'], ['combination', 'all']]) {
        const target = select(kind); target.value = value; await session.onChange({ target });
    }
    assert.equal(adapter.state.title, 'T');
    assert.match(adapter.state.description, /D/);
    assert.deepEqual(adapter.state.tags, ['one']);
    const tagButton = descendants(session.root).find((node) => node.dataset.action === 'tag' && node.dataset.tag === 'two');
    await session.onClick({ target: tagButton });
    assert.deepEqual(adapter.state.tags, ['one', 'two']);
    session.unmount();
    assert.equal(descendants(surface).filter((node) => node.dataset.vgenNyaUi === 'upload-assistant').length, 0);
});

test('Iteration 2 L1: compatible repository read migrates legacy data once and preserves legacy key', () => {
    const legacy = [{ id: 'g', name: 'Legacy', tags: [{ tag: 'same', note: 'keep' }] }];
    const driver = new MemoryStorageDriver({ [LEGACY_KEYS.searchTagGroups]: legacy });
    const repository = new UploadConfigRepository(new ConfigStore(driver));
    assert.deepEqual(repository.read().searchTagGroups, legacy);
    assert.deepEqual(driver.getValue(LEGACY_KEYS.searchTagGroups), legacy);
    assert.deepEqual(driver.getValue(CONFIG_KEYS.searchTagGroups), legacy);
});

class FakeMutationObserver {
    static instances = [];
    constructor(callback) { this.callback = callback; this.disconnected = false; FakeMutationObserver.instances.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
}

test('Iteration 2 L2: modal open/close/reopen has one session and releases both observers', () => {
    FakeMutationObserver.instances = [];
    const documentObject = new MiniDocument();
    const repository = new UploadConfigRepository(new ConfigStore(fixtureDriver()));
    const runtime = new UploadAssistantRuntime({
        repository, documentObject, MutationObserverClass: FakeMutationObserver,
        adapterFactory: () => { const adapter = new FakeAdapter(); adapter.findTagInput = () => ({}); return adapter; },
    });
    assert.equal(runtime.mount(), true);
    assert.deepEqual(FakeMutationObserver.instances[0].options, { childList: true });

    const first = documentObject.createElement('div'); first.setAttribute('role', 'dialog'); documentObject.body.append(first);
    FakeMutationObserver.instances[0].callback([{ addedNodes: [first], removedNodes: [] }]);
    assert.equal(runtime.sessions.size, 1);
    runtime.scanKnownModals(first);
    assert.equal(runtime.sessions.size, 1);
    first.remove();
    FakeMutationObserver.instances[0].callback([{ addedNodes: [], removedNodes: [first] }]);
    assert.equal(runtime.sessions.size, 0);
    assert.equal(FakeMutationObserver.instances[1].disconnected, true);

    const second = documentObject.createElement('div'); second.setAttribute('role', 'dialog'); documentObject.body.append(second);
    FakeMutationObserver.instances[0].callback([{ addedNodes: [second], removedNodes: [] }]);
    assert.equal(runtime.sessions.size, 1);
    runtime.unmount();
    assert.equal(runtime.sessions.size, 0);
    assert.ok(FakeMutationObserver.instances.every((observer) => observer.disconnected));
});

test('Iteration 2 L2: a detached empty portal releases its bounded probe immediately', () => {
    FakeMutationObserver.instances = [];
    const documentObject = new MiniDocument();
    const repository = new UploadConfigRepository(new ConfigStore(fixtureDriver()));
    const runtime = new UploadAssistantRuntime({ repository, documentObject, MutationObserverClass: FakeMutationObserver });
    runtime.mount();

    const portal = documentObject.createElement('div');
    portal.className = 'ReactModalPortal';
    documentObject.body.append(portal);
    FakeMutationObserver.instances[0].callback([{ addedNodes: [portal], removedNodes: [] }]);
    assert.equal(runtime.probes.size, 1);
    assert.equal(FakeMutationObserver.instances[1].disconnected, false);

    portal.remove();
    FakeMutationObserver.instances[0].callback([{ addedNodes: [], removedNodes: [portal] }]);
    assert.equal(runtime.probes.size, 0);
    assert.equal(FakeMutationObserver.instances[1].disconnected, true);
    runtime.unmount();
});

test('Iteration 2 L1: Description preset updates a Slate editor inside nested Shadow DOM', async () => {
    const body = { title: '', description: '[{"type":"paragraph","children":[{"text":""}]}]', tags: [] };
    const store = {
        getState: () => ({ showcaseReducer: { body } }),
        dispatch(action) { if (action.type === 'SHOWCASE/UPDATE-DESCRIPTION') body.description = action.description; },
    };
    const storeFiber = { dependencies: { firstContext: { memoizedValue: { store }, next: null } }, return: null };
    const tagProps = { initialTags: [], tagLimit: 20, async onChange() {} };
    const tagInput = { parentElement: null, '__reactFiber$test': { memoizedProps: tagProps, pendingProps: tagProps, return: storeFiber } };
    const editor = {
        children: [{ type: 'paragraph', children: [{ text: '' }] }],
        apply(operation) {
            if (operation.type === 'remove_node') this.children.splice(operation.path[0], 1);
            if (operation.type === 'insert_node') this.children.splice(operation.path[0], 0, operation.node);
        },
    };
    const editable = { parentElement: null, '__reactFiber$test': { memoizedState: { memoizedState: editor, next: null }, return: null } };
    const shadowHost = { shadowRoot: null };
    const shadowRoot = { host: shadowHost, querySelectorAll: () => [editable] };
    shadowHost.shadowRoot = shadowRoot;
    const documentObject = {
        createTreeWalker(root) {
            let done = false;
            return { nextNode() { if (root === surface && !done) { done = true; return shadowHost; } return null; } };
        },
    };
    shadowHost.ownerDocument = documentObject;
    const surface = {
        ownerDocument: documentObject,
        querySelectorAll(selector) {
            if (selector.startsWith('input[placeholder')) return [tagInput];
            return [];
        },
    };
    const serialized = '[{"type":"paragraph","children":[{"text":"Shadow Slate"}]}]';
    const adapter = new VGenUploadAdapter(surface);
    await adapter.applyText('description', serialized);
    assert.deepEqual(editor.children, JSON.parse(serialized));
    assert.equal(body.description, serialized);
});

test('Iteration 2 L1: Discovery collapse uses the native ExpandableSection callback', () => {
    let ariaHidden = 'false';
    const content = { getAttribute: (name) => name === 'aria-hidden' ? ariaHidden : null, parentElement: null };
    const root = { children: [content], '__reactProps$test': { onClick() { ariaHidden = 'true'; } } };
    content.parentElement = root;
    const props = { isDefaultHidden: false, onClickExpand() {} };
    const openHook = { memoizedState: true, queue: { dispatch() {} }, next: null };
    const control = {
        parentElement: null,
        closest: (selector) => selector === '[aria-hidden]' ? content : null,
        '__reactFiber$test': { memoizedProps: props, pendingProps: props, memoizedState: openHook, return: null },
    };
    const surface = {
        contains: (node) => node === root,
        querySelectorAll: (selector) => selector.startsWith('input[type="radio"]') ? [control] : [],
    };
    new VGenUploadAdapter(surface).collapseDiscovery();
    assert.equal(ariaHidden, 'true');
});

test('Iteration 2 L1: VGen adapter uses native tag callback, Redux state and discovery form callback', async () => {
    const body = { title: '', description: '[]', tags: ['one'], searchCategoryVariantKeys: [] };
    const store = {
        getState: () => ({ showcaseReducer: { body } }),
        dispatch(action) {
            if (action.type === 'SHOWCASE/UPDATE-TITLE') body.title = action.title;
            if (action.type === 'SHOWCASE/UPDATE-DESCRIPTION') body.description = action.description;
            if (action.type === 'SHOWCASE/SET-SEARCH-CATEGORY-VARIANT-KEYS') body.searchCategoryVariantKeys = action.payload.searchCategoryVariantKeys;
        },
    };
    const tagProps = { initialTags: ['one'], tagLimit: 20, showSelectedTags: true, async onChange(tags) { tagProps.initialTags = [...tags]; body.tags = [...tags]; } };
    const storeFiber = { memoizedProps: null, dependencies: { firstContext: { memoizedValue: { store }, next: null } }, return: null };
    const input = { parentElement: null, '__reactFiber$test': { memoizedProps: tagProps, pendingProps: tagProps, return: storeFiber } };
    const discoveryCalls = [];
    const discoveryProps = { formValues: { option: ['old'] }, onFormValueChange: async (id, value) => discoveryCalls.push([id, value]) };
    const discoveryControl = { parentElement: null, '__reactFiber$test': { memoizedProps: discoveryProps, pendingProps: discoveryProps, return: null } };
    const surface = {
        querySelectorAll(selector) {
            if (selector.startsWith('input[placeholder')) return [input];
            if (selector.startsWith('button,')) return [discoveryControl];
            return [];
        },
    };
    const adapter = new VGenUploadAdapter(surface);
    assert.deepEqual(adapter.read().tags, ['one']);
    await adapter.setTags(['ONE', 'two  words']);
    assert.deepEqual(body.tags, ['one', 'two words']);
    await adapter.applyText('title', 'Native title');
    assert.equal(body.title, 'Native title');
    await adapter.applyDiscovery({ values: { option: ['new'] } });
    assert.deepEqual(discoveryCalls, [['option', ['new']]]);

    tagProps.tagLimit = 5;
    assert.equal(adapter.findTagInput(), null, 'known commission/service TagSearch surface is blacklisted');
});
