// ==UserScript==
// @name         VGen小工具
// @namespace    https://vgen.co/
// @version      0.6.1
// @description  VGenToolNya Iteration 1 迁移桥：只读导出 VGen小工具旧配置。
// @author       @Nekori_Net
// @license      MIT
// @match        https://vgen.co/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
    'use strict';

    const FORMAT = 'vgen-nya.legacy-export';
    const SCHEMA_VERSION = 1;
    const SOURCE = Object.freeze({
        id: 'vgen-toolkit',
        name: 'VGen小工具',
        namespace: 'https://vgen.co/',
        version: '0.6.0',
    });
    const BRIDGE_VERSION = '0.6.1';
    const KEYS = Object.freeze([
        'vgen-toolkit-frequent-clients-v1',
        'vgen-toolkit-settings-v2',
    ]);

    function parseValue(value, key) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); }
        catch (error) { throw new TypeError(`${key} 不是有效 JSON`, { cause: error }); }
    }

    function validateValue(key, value) {
        const parsed = parseValue(value, key);
        if (key === 'vgen-toolkit-frequent-clients-v1') return Array.isArray(parsed);
        return key === 'vgen-toolkit-settings-v2'
            && parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    }

    function stableStringify(value) {
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
        if (value && typeof value === 'object') {
            return `{${Object.keys(value).sort().map((key) => (
                `${JSON.stringify(key)}:${stableStringify(value[key])}`
            )).join(',')}}`;
        }
        return JSON.stringify(value);
    }

    async function sha256(text) {
        const bytes = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    function readPayload() {
        const available = new Set(GM_listValues());
        const payload = {};
        for (const key of KEYS) {
            if (!available.has(key)) continue;
            const value = GM_getValue(key);
            if (!validateValue(key, value)) throw new TypeError(`${key} 数据形态不符合旧版结构`);
            payload[key] = value;
        }
        if (!Object.keys(payload).length) throw new Error('未找到 VGen小工具旧配置');
        return payload;
    }

    async function buildExport() {
        const envelope = {
            format: FORMAT,
            schemaVersion: SCHEMA_VERSION,
            source: SOURCE,
            bridgeVersion: BRIDGE_VERSION,
            exportedAt: new Date().toISOString(),
            payload: readPayload(),
        };
        envelope.integrity = {
            algorithm: 'SHA-256',
            digest: await sha256(stableStringify(envelope)),
        };
        return envelope;
    }

    async function exportLegacyData() {
        const button = document.getElementById('vgen-nya-toolkit-legacy-export');
        if (button) {
            button.disabled = true;
            button.dataset.exportStatus = 'working';
            delete button.dataset.exportError;
        }
        try {
            const envelope = await buildExport();
            const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `vgen-toolkit-legacy-${envelope.exportedAt.slice(0, 10)}.json`;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            if (button) {
                button.textContent = '旧配置已导出';
                button.dataset.exportStatus = 'complete';
            }
        } catch (error) {
            console.error('[VGen小工具 Migration Bridge]', error);
            if (button) {
                button.dataset.exportStatus = 'failed';
                button.dataset.exportError = String(error?.message || error);
            }
            window.alert(`导出失败：${error.message || error}`);
            if (button) button.textContent = '导出旧配置';
        } finally {
            if (button) button.disabled = false;
        }
    }

    function mountButton() {
        if (!document.body || document.getElementById('vgen-nya-toolkit-legacy-export')) return;
        const button = document.createElement('button');
        button.id = 'vgen-nya-toolkit-legacy-export';
        button.type = 'button';
        button.textContent = '导出小工具旧配置';
        button.title = '只读导出到本地 JSON；不会修改或删除旧配置';
        button.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;padding:8px 12px;border:1px solid #777;border-radius:8px;background:#fff;color:#222;font:13px system-ui;cursor:pointer';
        button.addEventListener('click', exportLegacyData);
        document.body.append(button);
    }

    GM_registerMenuCommand('VGenToolNya：导出小工具旧配置', exportLegacyData);
    mountButton();
})();
