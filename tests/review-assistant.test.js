import test from 'node:test';
import assert from 'node:assert/strict';
import { MiniDocument, descendants } from './helpers/mini-dom.js';
import { MemoryStorageDriver } from './helpers/memory-storage.js';
import { ConfigStore } from '../src/core/config-store.js';
import { createVGenNyaCore } from '../src/index.js';
import {
    DEFAULT_REVIEW_PROVIDER,
    DEFAULT_SYSTEM_PROMPT,
    isReviewProviderConfigured,
    maskApiKey,
    normalizeReviewProviderConfig,
    ReviewConfigRepository,
} from '../src/review/review-config.js';
import { DEFAULT_SYSTEM_PROMPT as PROMPT_FROM_MODULE } from '../src/review/default-system-prompt.js';
import { normalizeEnglishForHash, normalizeReviewCandidate, reviewEnglishHash } from '../src/review/review-candidate.js';
import { RecentReviewHistory, REVIEW_HISTORY_LIMIT } from '../src/review/review-history.js';
import {
    buildChatCompletionsUrl,
    buildReviewUserPrompt,
    normalizeProviderBaseUrl,
    parseReviewPayload,
    ReviewProviderAdapter,
    ReviewProviderError,
    REVIEW_PROVIDER_ERRORS,
} from '../src/review/review-provider-adapter.js';
import {
    createProviderTransport,
    FetchProviderTransport,
    GMProviderTransport,
} from '../src/review/provider-transport.js';
import { ReviewSession, REVIEW_SESSION_STATES } from '../src/review/review-session.js';
import { ReviewEditorAdapter, ReviewEditorTarget, defaultReviewEditorDetect } from '../src/review/review-editor-adapter.js';
import { ReviewAssistantRuntime, ReviewAssistantSession } from '../src/review/review-assistant.js';

function configuredProvider(overrides = {}) {
    return { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test-1234567890', model: 'test-model', systemPrompt: 'be helpful', ...overrides };
}

function providerRepository(provider = configuredProvider()) {
    return { read: () => ({ provider, settings: { defaultLength: 'Medium', defaultStarDegree: 3 } }) };
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function buttons(root) {
    return descendants(root).filter((node) => node.tagName === 'BUTTON');
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

test('Iteration 6 L1: provider config normalizes, masks the API key and keeps settings isolated', () => {
    assert.equal(DEFAULT_SYSTEM_PROMPT, PROMPT_FROM_MODULE);
    const store = new ConfigStore(new MemoryStorageDriver());
    const repository = new ReviewConfigRepository(store);
    assert.deepEqual(repository.read().provider, normalizeReviewProviderConfig(DEFAULT_REVIEW_PROVIDER));
    assert.equal(repository.read().settings.defaultLength, 'Medium');
    assert.equal(repository.read().settings.defaultStarDegree, 3);

    repository.writeProvider({ baseUrl: ' https://api.example.com/v1 ', apiKey: 'sk-abcdefgh12345678', model: 'm', systemPrompt: '' });
    const provider = repository.read().provider;
    assert.equal(provider.baseUrl, 'https://api.example.com/v1');
    assert.equal(provider.apiKey, 'sk-abcdefgh12345678');
    assert.equal(provider.model, 'm');
    assert.equal(provider.systemPrompt, DEFAULT_SYSTEM_PROMPT);
    assert.equal(isReviewProviderConfigured(provider), true);
    assert.equal(maskApiKey('sk-abcdefgh12345678'), 'sk-a…5678');
    assert.equal(maskApiKey('short'), '••••••••');
    assert.equal(maskApiKey(''), '');
    // API key lives only in the provider domain, never in the generation settings.
    assert.equal('apiKey' in repository.read().settings, false);
});

test('Iteration 6 L1: chat completions URL and user prompt carry endpoint, length, star degree and keywords', () => {
    assert.equal(buildChatCompletionsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
    assert.equal(buildChatCompletionsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
    assert.equal(buildChatCompletionsUrl(''), '');

    const prompt = buildReviewUserPrompt({ keywords: ['fast', 'friendly'], length: 'Long', starDegree: 5 });
    assert.match(prompt, /Long/);
    assert.match(prompt, /5 of 5/);
    assert.match(prompt, /fast, friendly/);
    assert.match(buildReviewUserPrompt({ keywords: [], length: 'Short', starDegree: 1 }), /1 of 5/);
    assert.match(buildReviewUserPrompt({ keywords: [], length: 'Short', starDegree: 3, distinctFromRecent: true }), /Phrase this differently/);
});

test('Iteration 6 L1: provider base URL rejects unsafe schemes and strips query/hash and trailing slash', () => {
    assert.equal(normalizeProviderBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
    assert.equal(normalizeProviderBaseUrl('https://api.example.com/v1?foo=bar#x'), 'https://api.example.com/v1');
    assert.equal(normalizeProviderBaseUrl('http://localhost:11434/v1/'), 'http://localhost:11434/v1');
    assert.equal(normalizeProviderBaseUrl('http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
    assert.equal(normalizeProviderBaseUrl('javascript:alert(1)'), '');
    assert.equal(normalizeProviderBaseUrl('data:text/plain,x'), '');
    assert.equal(normalizeProviderBaseUrl('file:///etc/passwd'), '');
    assert.equal(normalizeProviderBaseUrl('ftp://example.com/v1'), '');
    assert.equal(normalizeProviderBaseUrl('http://evil.example.com/v1'), '');
    assert.equal(normalizeProviderBaseUrl('not a url'), '');
    assert.equal(normalizeProviderBaseUrl(''), '');
    assert.equal(buildChatCompletionsUrl('javascript:alert(1)'), '');
    assert.equal(buildChatCompletionsUrl('https://api.example.com/v1/extra/'), 'https://api.example.com/v1/extra/chat/completions');
});

test('Iteration 6 L1: provider transport selects GM when available and falls back to browser fetch', () => {
    assert.ok(createProviderTransport({ gm: { GM_xmlhttpRequest: () => {} }, fetchImpl: async () => ({}) }) instanceof GMProviderTransport);
    assert.ok(createProviderTransport({ gm: {}, fetchImpl: async () => ({}) }) instanceof FetchProviderTransport);
});

test('Iteration 6 L1: GM transport normalizes responses, maps errors and honors abort', async () => {
    let captured;
    const gmRequest = (options) => {
        captured = options;
        return { abort() { options.onabort?.(); } };
    };
    const transport = new GMProviderTransport({ gmRequest });

    const first = transport.request('https://api.example.com/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer x' }, body: '{}' });
    captured.onload({ status: 200, responseText: '{"choices":[]}' });
    const okResponse = await first;
    assert.equal(okResponse.ok, true);
    assert.equal(okResponse.status, 200);
    assert.deepEqual(await okResponse.json(), { choices: [] });
    assert.equal(captured.method, 'POST');
    assert.equal(captured.headers.Authorization, 'Bearer x');
    assert.equal(captured.data, '{}');

    const controller = new AbortController();
    const aborted = transport.request('https://api.example.com/x', { signal: controller.signal });
    controller.abort();
    await assert.rejects(aborted, (error) => error.name === 'AbortError');

    const unauthorized = transport.request('https://api.example.com/x', {});
    captured.onload({ status: 401, responseText: '{}' });
    assert.equal((await unauthorized).ok, false);

    const errored = transport.request('https://api.example.com/x', {});
    captured.onerror({ error: 'boom' });
    await assert.rejects(errored, (error) => error.name === 'Error');
});

test('Iteration 6 L1: adapter routes through the injected GM transport', async () => {
    let captured;
    const gmRequest = (options) => { captured = options; return { abort() { options.onabort?.(); } }; };
    const adapter = new ReviewProviderAdapter({ transport: new GMProviderTransport({ gmRequest }), AbortControllerClass: AbortController });
    const promise = adapter.generate({ config: configuredProvider(), keywords: ['x'], length: 'Medium', starDegree: 3 });
    const content = JSON.stringify({ english: 'Via GM', chinese: '通过 GM' });
    captured.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content } }] }) });
    const result = await promise;
    assert.deepEqual(result, { english: 'Via GM', chinese: '通过 GM' });
    assert.equal(captured.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(captured.headers.Authorization, 'Bearer sk-test-1234567890');
});

test('Iteration 6 L1: parser accepts valid and fenced JSON and rejects invalid, missing-english and missing-chinese', () => {
    assert.deepEqual(parseReviewPayload('{"english":"Nice","chinese":"不错"}'), { ok: true, english: 'Nice', chinese: '不错' });
    assert.equal(parseReviewPayload('```json\n{"english":"A","chinese":"B"}\n```').ok, true);
    assert.equal(parseReviewPayload('```\n{"english":"A","chinese":"B"}\n```').ok, true);

    const invalid = parseReviewPayload('not json at all');
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, REVIEW_PROVIDER_ERRORS.invalidJson);
    assert.equal(parseReviewPayload('[]').code, REVIEW_PROVIDER_ERRORS.malformed);
    assert.equal(parseReviewPayload('{"chinese":"只有中文"}').reason, 'missing-english');
    assert.equal(parseReviewPayload('{"english":"Only english"}').reason, 'missing-chinese');
});

test('Iteration 6 L1: adapter builds a correct chat/completions request with bearer auth and parses the payload', async () => {
    const requests = [];
    const adapter = new ReviewProviderAdapter({
        AbortControllerClass: AbortController,
        fetchImpl: async (url, options) => {
            requests.push({ url: String(url), options });
            return { ok: true, json: async () => ({ choices: [{ message: { content: '{"english":"Great work","chinese":"很棒"}' } }] }) };
        },
    });
    const result = await adapter.generate({ config: configuredProvider(), keywords: ['fast'], length: 'Long', starDegree: 5 });
    assert.deepEqual(result, { english: 'Great work', chinese: '很棒' });
    const request = requests[0];
    assert.equal(request.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer sk-test-1234567890');
    assert.equal(request.options.headers['Content-Type'], 'application/json');
    const body = JSON.parse(request.options.body);
    assert.equal(body.model, 'test-model');
    assert.equal(body.messages[0].role, 'system');
    assert.equal(body.messages[0].content, 'be helpful');
    assert.equal(body.messages[1].role, 'user');
});

test('Iteration 6 L1: adapter maps provider failures to clear error codes without silent success', async () => {
    const withFetch = (fetchImpl) => new ReviewProviderAdapter({ AbortControllerClass: AbortController, fetchImpl, timeoutMs: 30000 });
    await assert.rejects(
        () => withFetch(async () => ({ ok: false, status: 401 })).generate({ config: configuredProvider() }),
        (error) => error instanceof ReviewProviderError && error.code === REVIEW_PROVIDER_ERRORS.auth,
    );
    await assert.rejects(
        () => withFetch(async () => ({ ok: false, status: 429 })).generate({ config: configuredProvider() }),
        (error) => error.code === REVIEW_PROVIDER_ERRORS.rateLimit,
    );
    await assert.rejects(
        () => withFetch(async () => ({ ok: false, status: 500 })).generate({ config: configuredProvider() }),
        (error) => error.code === REVIEW_PROVIDER_ERRORS.http,
    );
    await assert.rejects(
        () => withFetch(async () => { throw new Error('offline'); }).generate({ config: configuredProvider() }),
        (error) => error.code === REVIEW_PROVIDER_ERRORS.network,
    );
    await assert.rejects(
        () => withFetch(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"english":"no chinese"}' } }] }) })).generate({ config: configuredProvider() }),
        (error) => error.code === REVIEW_PROVIDER_ERRORS.malformed,
    );
    await assert.rejects(
        () => withFetch(async () => { throw new Error('unused'); }).generate({ config: { baseUrl: '', apiKey: '', model: '' } }),
        (error) => error.code === REVIEW_PROVIDER_ERRORS.notConfigured,
    );
});

test('Iteration 6 L1: candidate normalization requires English and produces a stable hash', () => {
    assert.equal(normalizeReviewCandidate(null), null);
    assert.equal(normalizeReviewCandidate({ english: '   ' }), null);
    assert.equal(normalizeReviewCandidate({ english: '' }), null);
    const candidate = normalizeReviewCandidate({ english: '  Great work ', chinese: ' 很棒 ', keywords: ['fast'], length: 'Short', starDegree: 4 });
    assert.equal(candidate.english, 'Great work');
    assert.equal(candidate.chinese, '很棒');
    assert.deepEqual(candidate.keywords, ['fast']);
    assert.equal(candidate.length, 'Short');
    assert.equal(candidate.starDegree, 4);
    assert.equal(typeof candidate.hash, 'string');
    assert.equal(normalizeEnglishForHash('Hello  World'), 'hello world');
    assert.equal(reviewEnglishHash('Hello  World'), reviewEnglishHash('hello world'));
    assert.notEqual(reviewEnglishHash('Hello World'), reviewEnglishHash('Hello World!'));
});

test('Iteration 6 L1: bounded recent history dedupes normalized text and evicts the oldest entries', () => {
    const history = new RecentReviewHistory({ limit: 3 });
    history.record('Hello World');
    history.record('hello  world');
    assert.equal(history.size, 1);
    assert.equal(history.has('hello world'), true);
    history.record('a');
    history.record('b');
    history.record('c');
    assert.equal(history.size, 3);
    assert.equal(history.has('Hello World'), false);
    assert.equal(history.has('a'), true);
    assert.equal(history.has('b'), true);
    assert.equal(history.has('c'), true);
    history.clear();
    assert.equal(history.size, 0);
    assert.ok(REVIEW_HISTORY_LIMIT >= 10 && REVIEW_HISTORY_LIMIT <= 20);
});

test('Iteration 6 L1: session enforces the generation lock and only one request runs at a time', async () => {
    const calls = [];
    const adapter = { generate: async (args) => { calls.push(args); await new Promise((resolve) => setTimeout(resolve, 2)); return { english: 'x', chinese: 'y' }; } };
    const session = new ReviewSession({ sessionId: 's1', adapter, history: new RecentReviewHistory(), providerRepository: providerRepository(), AbortControllerClass: AbortController });
    const first = session.generate({});
    const second = session.generate({});
    await Promise.all([first, second]);
    assert.equal(calls.length, 1);
    assert.equal(session.state, REVIEW_SESSION_STATES.ready);
    assert.equal(session.generated, true);
    assert.equal(session.candidate.english, 'x');
    session.dispose();
});

test('Iteration 6 L1: session without a provider reports not configured and never requests', async () => {
    const calls = [];
    const adapter = { generate: async () => { calls.push(1); return { english: 'x', chinese: 'y' }; } };
    const session = new ReviewSession({ sessionId: 's2', adapter, history: new RecentReviewHistory(), providerRepository: providerRepository(null), AbortControllerClass: AbortController });
    assert.equal(await session.generate({}), false);
    assert.equal(calls.length, 0);
    assert.equal(session.state, REVIEW_SESSION_STATES.error);
    assert.equal(session.error.code, 'PROVIDER_NOT_CONFIGURED');
});

test('Iteration 6 L1: regenerate avoids recent hashes and keeps the previous candidate on failure', async () => {
    let callCount = 0;
    const calls = [];
    const adapter = { generate: async (args) => { callCount += 1; calls.push(args); if (callCount === 1 || callCount === 2) return { english: 'Repeat me', chinese: 'x' }; return { english: 'Fresh wording', chinese: 'y' }; } };
    const history = new RecentReviewHistory();
    const session = new ReviewSession({ sessionId: 's3', adapter, history, providerRepository: providerRepository(), AbortControllerClass: AbortController });
    await session.generate({});
    assert.equal(session.candidate.english, 'Repeat me');
    await session.regenerate({});
    assert.equal(session.candidate.english, 'Fresh wording');
    assert.equal(calls[2].distinctFromRecent, true);

    const duplicateAdapter = { generate: async () => ({ english: 'Same', chinese: '同' }) };
    const duplicateSession = new ReviewSession({ sessionId: 's4', adapter: duplicateAdapter, history: new RecentReviewHistory(), providerRepository: providerRepository(), AbortControllerClass: AbortController });
    await duplicateSession.generate({});
    await duplicateSession.regenerate({});
    assert.equal(duplicateSession.candidate.duplicate, true);

    let keepCalls = 0;
    const failingAdapter = { generate: async () => { keepCalls += 1; if (keepCalls === 2) throw Object.assign(new Error('rate limited'), { code: 'RATE_LIMIT' }); return { english: 'Good', chinese: '好' }; } };
    const keepSession = new ReviewSession({ sessionId: 's5', adapter: failingAdapter, history: new RecentReviewHistory(), providerRepository: providerRepository(), AbortControllerClass: AbortController });
    await keepSession.generate({});
    assert.equal(keepSession.candidate.english, 'Good');
    await keepSession.regenerate({});
    assert.equal(keepSession.candidate.english, 'Good'); // failure keeps the old candidate
    assert.equal(keepSession.state, REVIEW_SESSION_STATES.error);
    assert.equal(keepSession.error.code, 'RATE_LIMIT');
});

test('Iteration 6 L1: disposing a session aborts in-flight requests and ignores stale responses', async () => {
    const pending = [];
    const history = new RecentReviewHistory();
    const adapter = { generate: async ({ signal }) => { const entry = deferred(); pending.push({ signal, ...entry }); return entry.promise; } };
    const session = new ReviewSession({ sessionId: 's6', adapter, history, providerRepository: providerRepository(), AbortControllerClass: AbortController });
    const generating = session.generate({});
    assert.equal(pending.length, 1);
    session.dispose('review-session-closed');
    assert.equal(pending[0].signal.aborted, true);
    pending[0].resolve({ english: 'Stale', chinese: '旧' });
    await generating;
    assert.equal(session.candidate, null);
    assert.equal(history.has('Stale'), false);
});

test('Iteration 6 L1: editor adapter detects, reads and fills without any submit path', async () => {
    const documentObject = new MiniDocument();
    const form = documentObject.createElement('form');
    documentObject.body.append(form);
    const textarea = documentObject.createElement('textarea');
    textarea.value = '';
    form.append(textarea);
    const adapter = new ReviewEditorAdapter();
    const target = adapter.resolve(form);
    assert.equal(target.element, textarea);
    assert.equal(defaultReviewEditorDetect(form), textarea);
    assert.equal(target.read(), '');
    assert.equal((await target.fill('Hello review')).status, 'filled');
    assert.equal(textarea.value, 'Hello review');
    assert.equal((await target.fill('Other')).status, 'requires-confirmation');
    assert.equal(textarea.value, 'Hello review');
    assert.equal((await target.fill('Other', { replace: true })).status, 'filled');
    assert.equal(textarea.value, 'Other');

    const editable = documentObject.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    documentObject.body.append(editable);
    const editableTarget = new ReviewEditorTarget(editable);
    await editableTarget.fill('Editable text');
    assert.equal(editable.textContent, 'Editable text');
});

function makeRuntime({ documentObject, provider = configuredProvider(), adapter, history = new RecentReviewHistory(), writes = [] } = {}) {
    const store = new ConfigStore(new MemoryStorageDriver());
    const repository = new ReviewConfigRepository(store);
    if (provider) repository.writeProvider(provider);
    const runtime = new ReviewAssistantRuntime({
        repository,
        adapter: adapter || { generate: async () => ({ english: 'Nice work', chinese: '做得好' }) },
        history,
        clipboard: { writeText: async (value) => writes.push(value) },
        documentObject,
        AbortControllerClass: AbortController,
    });
    runtime.mount();
    return { runtime, repository, writes, history };
}

function openSurface(runtime, documentObject, initial = '') {
    const panel = documentObject.createElement('section');
    documentObject.body.append(panel);
    const editor = documentObject.createElement('textarea');
    editor.value = initial;
    panel.append(editor);
    assert.equal(runtime.openSurface({ root: panel }), true);
    return editor;
}

test('Iteration 6 L2 A: opening a review surface auto-generates exactly once and rerender does not duplicate', async () => {
    const calls = [];
    const documentObject = new MiniDocument();
    const { runtime } = makeRuntime({ documentObject, adapter: { generate: async (args) => { calls.push(args); return { english: 'Auto text', chinese: '自动' }; } } });
    openSurface(runtime, documentObject);
    await flush();
    assert.equal(calls.length, 1);
    await flush();
    assert.equal(calls.length, 1); // re-render after ready must not re-request
    assert.equal(runtime.current.session.model.candidate.english, 'Auto text');
    runtime.closeSurface();
    assert.equal(runtime.current, null);
});

test('Iteration 6 L2 A: reopening the review surface creates a new session that auto-generates once', async () => {
    const calls = [];
    const documentObject = new MiniDocument();
    const { runtime } = makeRuntime({ documentObject, adapter: { generate: async () => { calls.push(1); return { english: `Text ${calls.length}`, chinese: '文' }; } } });
    openSurface(runtime, documentObject);
    await flush();
    assert.equal(calls.length, 1);
    runtime.closeSurface();
    openSurface(runtime, documentObject);
    await flush();
    assert.equal(calls.length, 2);
    assert.equal(buttons(runtime.current.session.root).length > 0, true);
    runtime.closeSurface();
});

test('Iteration 6 L2 B: candidate ready enables Copy English and Fill Review without submitting', async () => {
    const writes = [];
    const documentObject = new MiniDocument();
    const { runtime } = makeRuntime({ documentObject, writes });
    const editor = openSurface(runtime, documentObject);
    await flush();
    const session = runtime.current.session;
    const copyEnglish = buttons(session.root).find((button) => button.dataset.action === 'copy-english');
    assert.ok(copyEnglish);
    copyEnglish.click();
    await flush();
    assert.deepEqual(writes, ['Nice work']);

    buttons(session.root).find((button) => button.dataset.action === 'fill').click();
    await flush();
    assert.equal(editor.value, 'Nice work');
    // Chinese is never written to the native review editor.
    assert.notEqual(editor.value, '做得好');
    runtime.closeSurface();
});

test('Iteration 6 L2 B: generation parameters flow from the controls into the request', async () => {
    const calls = [];
    const documentObject = new MiniDocument();
    const { runtime } = makeRuntime({ documentObject, adapter: { generate: async (args) => { calls.push(args); return { english: 'Param', chinese: '参数' }; } } });
    openSurface(runtime, documentObject);
    await flush();
    const session = runtime.current.session;
    session.root.querySelector('[data-role="keywords"]').value = 'fast, friendly';
    session.root.querySelector('[data-role="length"]').value = 'Long';
    session.root.querySelector('[data-role="star"]').value = '5';
    buttons(session.root).find((button) => button.dataset.action === 'generate').click();
    await flush();
    const last = calls[calls.length - 1];
    assert.deepEqual(last.keywords, ['fast', 'friendly']);
    assert.equal(last.length, 'Long');
    assert.equal(last.starDegree, 5);
    runtime.closeSurface();
});

test('Iteration 6 L2 C: filling a non-empty review asks for confirmation and cancel preserves the original', async () => {
    const documentObject = new MiniDocument();
    documentObject.defaultView = { confirm: (message) => { confirmations.push(message); return true; } };
    const confirmations = [];
    const { runtime } = makeRuntime({ documentObject });
    const editor = openSurface(runtime, documentObject, 'Original draft');
    await flush();
    buttons(runtime.current.session.root).find((button) => button.dataset.action === 'fill').click();
    await flush();
    assert.equal(confirmations.length, 1);
    assert.equal(editor.value, 'Nice work');
    runtime.closeSurface();

    const cancelled = new MiniDocument();
    cancelled.defaultView = { confirm: () => false };
    const second = makeRuntime({ documentObject: cancelled });
    const editor2 = openSurface(second.runtime, cancelled, 'Keep me');
    await flush();
    buttons(second.runtime.current.session.root).find((button) => button.dataset.action === 'fill').click();
    await flush();
    assert.equal(editor2.value, 'Keep me');
    second.runtime.closeSurface();
});

test('Iteration 6 L2 D: closing while pending aborts, and a stale result is ignored after reopen', async () => {
    const pending = [];
    const history = new RecentReviewHistory();
    const adapter = { generate: async ({ signal }) => { const entry = deferred(); pending.push({ signal, ...entry }); return entry.promise; } };
    const documentObject = new MiniDocument();
    const { runtime } = makeRuntime({ documentObject, adapter, history });
    openSurface(runtime, documentObject);
    await flush();
    assert.equal(pending.length, 1);
    runtime.closeSurface();
    assert.equal(pending[0].signal.aborted, true);

    openSurface(runtime, documentObject);
    await flush();
    assert.equal(pending.length, 2);
    assert.equal(runtime.current.session.model.sessionId, 'review-2');
    pending[1].resolve({ english: 'New result', chinese: '新' });
    await flush();
    assert.equal(runtime.current.session.model.candidate.english, 'New result');
    pending[0].resolve({ english: 'Stale result', chinese: '旧' });
    await flush();
    assert.equal(runtime.current.session.model.candidate.english, 'New result');
    assert.equal(history.has('Stale result'), false);
    assert.equal(history.has('New result'), true);
    runtime.closeSurface();
});

test('Iteration 6 L2 E: provider error renders readable status and a regenerate recovers to ready', async () => {
    let fail = true;
    const adapter = {
        generate: async () => {
            if (fail) { fail = false; throw Object.assign(new Error('rate limited'), { code: 'RATE_LIMIT' }); }
            return { english: 'Recovered', chinese: '恢复' };
        },
    };
    const documentObject = new MiniDocument();
    const { runtime } = makeRuntime({ documentObject, adapter });
    openSurface(runtime, documentObject);
    await flush();
    const session = runtime.current.session;
    const status = descendants(session.root).find((node) => node.className.includes('vgen-nya-review-assistant__status'));
    assert.equal(status.dataset.error, 'true');
    assert.match(status.textContent, /429/);
    assert.equal(session.model.candidate, null);
    buttons(session.root).find((button) => button.dataset.action === 'generate').click();
    await flush();
    assert.equal(session.model.state, REVIEW_SESSION_STATES.ready);
    assert.equal(session.model.candidate.english, 'Recovered');
    runtime.closeSurface();
});

test('Iteration 6 L2: without a configured provider the widget shows a clear status and never requests', async () => {
    const calls = [];
    const documentObject = new MiniDocument();
    const { runtime } = makeRuntime({ documentObject, provider: null, adapter: { generate: async () => { calls.push(1); return { english: 'x', chinese: 'y' }; } } });
    openSurface(runtime, documentObject);
    await flush();
    assert.equal(calls.length, 0);
    const status = descendants(runtime.current.session.root).find((node) => node.className.includes('vgen-nya-review-assistant__status'));
    assert.match(status.textContent, /Provider not configured/);
    runtime.closeSurface();
});

test('Iteration 6 L2: Review Assistant Settings keeps three levels with Provider and generation tabs', () => {
    const core = createVGenNyaCore({ storageDriver: new MemoryStorageDriver(), gm: {} });
    const documentObject = new MiniDocument();
    const host = documentObject.createElement('div');
    core.mountSettings(host);
    core.settingsShell.selectNavigation('reviews');
    const tabs = buttons(core.settingsShell.element).filter((button) => button.dataset.action === 'tab').map((button) => button.textContent);
    assert.deepEqual(tabs, ['生成', 'Provider']);
    core.settingsShell.selectTab('provider');
    assert.equal(core.settingsShell.toggleSection('reviews:provider:provider-config'), true);
    core.dispose();
    assert.equal(host.children.length, 0);
});
