import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildProduction, readReleaseInputs } from '../scripts/build.mjs';
import { LEGACY_EXPORT_SCHEMA_VERSION } from '../src/migration/legacy-export-schema.js';

function versionFromMetadata(text) {
    return text.match(/^\/\/ @version\s+(.+)$/m)?.[1]?.trim();
}

test('Release Foundation: package.json is the only APP_VERSION source for both artifacts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vgen-nya-build-test-'));
    try {
        const { packageJson } = await readReleaseInputs();
        const result = await buildProduction({ outdir: root, releaseBaseUrl: '' });
        assert.equal(versionFromMetadata(result.userscript), packageJson.version);
        assert.equal(versionFromMetadata(result.metadata), packageJson.version);
        assert.match(result.userscript, new RegExp(`APP_VERSION = ${JSON.stringify(packageJson.version).replaceAll('.', '\\.')}|${packageJson.version.replaceAll('.', '\\.')}`));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
test('Release Foundation: local build omits fake update URLs and keeps export schema independent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'vgen-nya-build-test-'));
    try {
        const { packageJson } = await readReleaseInputs();
        const result = await buildProduction({ outdir: root, releaseBaseUrl: '' });
        assert.doesNotMatch(result.metadata, /@updateURL|@downloadURL/);
        assert.equal(LEGACY_EXPORT_SCHEMA_VERSION, 1);
        assert.notEqual(String(LEGACY_EXPORT_SCHEMA_VERSION), packageJson.version);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('Release Foundation: production build is deterministic and excludes Bridge code', async () => {
    const firstRoot = await mkdtemp(path.join(os.tmpdir(), 'vgen-nya-build-test-'));
    const secondRoot = await mkdtemp(path.join(os.tmpdir(), 'vgen-nya-build-test-'));
    try {
        const first = await buildProduction({ outdir: firstRoot, releaseBaseUrl: '' });
        const second = await buildProduction({ outdir: secondRoot, releaseBaseUrl: '' });
        assert.equal(first.userscript, second.userscript);
        assert.equal(first.metadata, second.metadata);
        assert.doesNotMatch(first.userscript, /vgen-nya-quick-tag-legacy-export|vgen-nya-toolkit-legacy-export/);
    } finally {
        await Promise.all([
            rm(firstRoot, { recursive: true, force: true }),
            rm(secondRoot, { recursive: true, force: true }),
        ]);
    }
});
