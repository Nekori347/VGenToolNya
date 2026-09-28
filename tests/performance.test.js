import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...await sourceFiles(fullPath));
        else if (entry.name.endsWith('.js')) files.push(fullPath);
    }
    return files;
}

async function sha256(filePath) {
    return createHash('sha256').update(await readFile(filePath)).digest('hex').toUpperCase();
}

test('L2: read-only attachment baselines retain their audited SHA-256 values', async () => {
    assert.equal(
        await sha256(path.join(projectRoot, '附件', 'VGen-Tag-Quick-v0.9.12.txt')),
        '766958403DD48B4D16ABE0CC4A4C69BE3FF69BC9B4AA8947195ED61535DFA0C2',
    );
    assert.equal(
        await sha256(path.join(projectRoot, '附件', 'VGen小工具-v0.6.0.txt')),
        'F760090B5DD7350B80F65B45C4E3C4B281A86702138968EC635DD5D3578EB6E5',
    );
});

test('L2: Iteration 1 runtime introduces no whole-page observer, wildcard scan or network hook', async () => {
    const files = await sourceFiles(path.join(projectRoot, 'src'));
    for (const file of files) {
        const source = await readFile(file, 'utf8');
        assert.doesNotMatch(source, /querySelectorAll\s*\(\s*['"]\*['"]\s*\)/, file);
        assert.doesNotMatch(source, /observe\s*\(\s*document\.(?:documentElement|body)/, file);
        if (!file.endsWith(path.join('chat', 'network-hooks.js'))) {
            assert.doesNotMatch(source, /XMLHttpRequest\.prototype\.(?:open|send|abort)\s*=/, file);
            assert.doesNotMatch(source, /(?:window|windowObject|globalThis|this\.window)\.(?:fetch|WebSocket|EventSource)\s*=/, file);
        }
    }
});

test('Iteration 3 L2: Chat runtime has no polling, body subtree observer, wildcard scan or Fiber subtree walk', async () => {
    const runtime = await readFile(path.join(projectRoot, 'src/chat/chat-assistant.js'), 'utf8');
    const adapter = await readFile(path.join(projectRoot, 'src/chat/stream-chat-adapter.js'), 'utf8');
    const clients = await readFile(path.join(projectRoot, 'src/clients/frequent-clients.js'), 'utf8');
    for (const [name, source] of [['chat runtime', runtime], ['chat adapter', adapter], ['frequent clients', clients]]) {
        assert.doesNotMatch(source, /setInterval\s*\(|requestAnimationFrame\s*\(/, name);
        assert.doesNotMatch(source, /querySelectorAll\s*\(\s*['"]\*['"]\s*\)/, name);
        assert.doesNotMatch(source, /fiber\.(?:child|sibling)/, name);
        assert.doesNotMatch(source, /observe\([^\n]*documentElement/, name);
    }
    assert.match(runtime, /observe\(this\.documentObject\.body, \{ childList: true \}\)/);
    assert.doesNotMatch(runtime, /observe\(this\.documentObject\.body, \{[^}]*subtree:\s*true/);
});

test('L2: mounted app and settings modules schedule no idle interval, timeout or RAF loop', async () => {
    const runtimeFiles = [
        'src/index.js',
        'src/settings/settings-shell.js',
        'src/settings/navigation.js',
        'src/migration/legacy-migration.js',
    ];
    for (const relativePath of runtimeFiles) {
        const source = await readFile(path.join(projectRoot, relativePath), 'utf8');
        assert.doesNotMatch(source, /setInterval\s*\(/, relativePath);
        assert.doesNotMatch(source, /setTimeout\s*\(/, relativePath);
        assert.doesNotMatch(source, /requestAnimationFrame\s*\(/, relativePath);
    }
});

test('Iteration 2 L2: Upload runtime uses bounded ancestor Fiber access and a non-subtree portal observer', async () => {
    const adapter = await readFile(path.join(projectRoot, 'src/upload/vgen-upload-adapter.js'), 'utf8');
    const runtime = await readFile(path.join(projectRoot, 'src/upload/upload-assistant.js'), 'utf8');
    assert.doesNotMatch(adapter, /fiber\.(?:child|sibling)/);
    assert.doesNotMatch(runtime, /setInterval\s*\(|requestAnimationFrame\s*\(/);
    assert.match(runtime, /observe\(this\.documentObject\.body, \{ childList: true \}\)/);
    assert.doesNotMatch(runtime, /observe\(this\.documentObject\.body, \{[^}]*subtree:\s*true/);
});

test('Iteration 4 L2: preset integrations add no polling, global subtree observer or submit API', async () => {
    const files = [
        'src/presets/text-preset-engine.js',
        'src/chat/quick-reply.js',
        'src/order/order-text-presets.js',
    ];
    for (const relativePath of files) {
        const source = await readFile(path.join(projectRoot, relativePath), 'utf8');
        assert.doesNotMatch(source, /setInterval\s*\(|requestAnimationFrame\s*\(/, relativePath);
        assert.doesNotMatch(source, /querySelectorAll\s*\(\s*['"]\*['"]\s*\)/, relativePath);
        assert.doesNotMatch(source, /(?:sendMessage|applyAndSend|applyAndSave|applyAndDeliver)\s*\(/, relativePath);
        assert.doesNotMatch(source, /observe\([^\n]*documentElement/, relativePath);
    }
    const order = await readFile(path.join(projectRoot, 'src/order/order-text-presets.js'), 'utf8');
    assert.match(order, /observe\(this\.documentObject\.body, \{ childList: true \}\)/);
    assert.doesNotMatch(order, /observe\(this\.documentObject\.body, \{[^}]*subtree:\s*true/);
    const entry = await readFile(path.join(projectRoot, 'src/userscript-entry.js'), 'utf8');
    assert.doesNotMatch(entry, /core\.mountOrderTextPresets\(\)/, 'Private Note runtime must remain gated until autosave safety is verified');
});

test('Iteration 5 L2: Order Assistant uses one direct-child detector, scoped session observation and GET-only review access', async () => {
    const files = [
        'src/order/order-assistant.js',
        'src/order/order-detail-lifecycle.js',
        'src/order/client-background-cache.js',
        'src/order/client-review-adapter.js',
    ];
    const sources = await Promise.all(files.map((relativePath) => readFile(path.join(projectRoot, relativePath), 'utf8')));
    for (const [index, source] of sources.entries()) {
        assert.doesNotMatch(source, /setInterval\s*\(|requestAnimationFrame\s*\(/, files[index]);
        assert.doesNotMatch(source, /querySelectorAll\s*\(\s*['"]\*['"]\s*\)/, files[index]);
        assert.doesNotMatch(source, /observe\([^\n]*documentElement/, files[index]);
        assert.doesNotMatch(source, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/, files[index]);
    }
    const lifecycle = sources[1];
    assert.match(lifecycle, /observe\(this\.documentObject\.body, \{ childList: true \}\)/);
    assert.doesNotMatch(lifecycle, /observe\(this\.documentObject\.body, \{[^}]*subtree:\s*true/);
    assert.match(lifecycle, /\[0, 80, 250, 700, 1500\]/, 'portal scan retries must remain explicitly bounded');
    const entry = await readFile(path.join(projectRoot, 'src/userscript-entry.js'), 'utf8');
    assert.match(entry, /core\.mountOrderAssistant\(\)/);
    assert.doesNotMatch(entry, /core\.mountOrderTextPresets\(\)/, 'Private Note remains gated');
});
