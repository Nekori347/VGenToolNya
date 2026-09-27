import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import { createLegacyExport, parseLegacyExport } from '../src/migration/legacy-export-schema.js';
import { cloneStorageValue } from '../src/core/value-utils.js';
import { MiniDocument } from './helpers/mini-dom.js';
import { quickTagLegacyPayload, toolkitLegacyPayload } from './helpers/legacy-fixtures.js';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('Deployment L2: export schema identifies both sources without relying on filenames', async () => {
    const quick = await createLegacyExport({ sourceId: 'vgen-tag-quick', payload: quickTagLegacyPayload() });
    const toolkit = await createLegacyExport({ sourceId: 'vgen-toolkit', payload: toolkitLegacyPayload() });

    assert.equal((await parseLegacyExport(JSON.stringify(quick))).source.id, 'vgen-tag-quick');
    assert.equal((await parseLegacyExport(JSON.stringify(toolkit))).source.id, 'vgen-toolkit');
    assert.equal(quick.schemaVersion, 1);
    assert.equal(toolkit.schemaVersion, 1);
    assert.match(quick.integrity.digest, /^[a-f0-9]{64}$/);
});

test('Deployment L2: corrupt JSON, schema, source and payload tampering are rejected', async () => {
    const valid = await createLegacyExport({ sourceId: 'vgen-tag-quick', payload: quickTagLegacyPayload() });
    await assert.rejects(() => parseLegacyExport('{broken'), /not valid JSON/);

    const wrongSchema = cloneStorageValue(valid);
    wrongSchema.schemaVersion = 999;
    await assert.rejects(() => parseLegacyExport(wrongSchema), /schema version/);

    const wrongSource = cloneStorageValue(valid);
    wrongSource.source.id = 'unknown-script';
    await assert.rejects(() => parseLegacyExport(wrongSource), /Unknown legacy export source/);

    const tampered = cloneStorageValue(valid);
    tampered.payload['vgen-tag-presets-v1'][0].name = 'tampered';
    await assert.rejects(() => parseLegacyExport(tampered), /integrity check failed/);
});

for (const bridge of [
    {
        file: 'migration/bridges/VGen-Tag-Quick-Legacy-Export-Bridge.user.js',
        name: 'VGen 快速标签',
        namespace: 'https://vgen.co/',
        payload: quickTagLegacyPayload(),
        sourceId: 'vgen-tag-quick',
    },
    {
        file: 'migration/bridges/VGen-Toolkit-Legacy-Export-Bridge.user.js',
        name: 'VGen小工具',
        namespace: 'https://vgen.co/',
        payload: toolkitLegacyPayload(),
        sourceId: 'vgen-toolkit',
    },
]) {
    test(`Deployment L2: ${bridge.name} Bridge keeps identity, reads only and exports a valid envelope`, async () => {
        const source = await readFile(path.join(projectRoot, bridge.file), 'utf8');
        assert.match(source, new RegExp(`// @name\\s+${bridge.name}`));
        assert.match(source, new RegExp(`// @namespace\\s+${bridge.namespace.replace(/[/.]/g, '\\$&')}`));
        assert.doesNotMatch(source, /@grant\s+GM_(?:setValue|deleteValue)/);
        assert.doesNotMatch(source, /localStorage|BroadcastChannel|postMessage|indexedDB|GM_xmlhttpRequest/);

        const original = cloneStorageValue(bridge.payload);
        const documentObject = new MiniDocument();
        let menuCallback;
        let exportedBlob;
        const context = {
            Blob,
            TextEncoder,
            Uint8Array,
            Set,
            Object,
            Array,
            Date,
            JSON,
            TypeError,
            Error,
            Promise,
            crypto: globalThis.crypto,
            console,
            document: documentObject,
            window: { alert() {} },
            setTimeout(callback) { callback(); },
            URL: {
                createObjectURL(blob) { exportedBlob = blob; return 'blob:test'; },
                revokeObjectURL() {},
            },
            GM_listValues: () => Object.keys(bridge.payload),
            GM_getValue: (key) => cloneStorageValue(bridge.payload[key]),
            GM_registerMenuCommand: (_label, callback) => { menuCallback = callback; },
        };
        vm.runInNewContext(source, context, { filename: bridge.file });
        await menuCallback();
        const parsed = await parseLegacyExport(await exportedBlob.text());

        assert.equal(parsed.source.id, bridge.sourceId);
        assert.deepEqual(parsed.payload, original);
        assert.deepEqual(bridge.payload, original);
    });
}
