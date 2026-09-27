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
        assert.doesNotMatch(source, /new\s+MutationObserver\s*\(/, file);
        assert.doesNotMatch(source, /querySelectorAll\s*\(\s*['"]\*['"]\s*\)/, file);
        assert.doesNotMatch(source, /observe\s*\(\s*document\.(?:documentElement|body)/, file);
        assert.doesNotMatch(source, /XMLHttpRequest\.prototype\.(?:open|send|abort)\s*=/, file);
        assert.doesNotMatch(source, /(?:window|globalThis)\.(?:fetch|WebSocket|EventSource)\s*=/, file);
    }
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
