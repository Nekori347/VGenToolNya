import {
    commitLegacyImport,
    prepareLegacyImport,
    recoverPendingLegacyImport,
} from './legacy-importer.js';

function node(documentObject, tagName, attributes = {}, text = '') {
    const element = documentObject.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) {
        if (name === 'className') element.className = value;
        else element.setAttribute(name, value);
    }
    if (text) element.textContent = text;
    return element;
}

function statusText(target) {
    if (target.status === 'already-migrated') return '已迁移；不会重复写入';
    if (target.status === 'conflict') return `冲突；保留现有新值（${target.reason}）`;
    return '待迁移';
}

export function createLegacyImportUI({ store, documentObject = globalThis.document } = {}) {
    let root = null;
    let fileInput = null;
    let preview = null;
    let status = null;
    let confirmButton = null;
    let pendingPlan = null;
    let recoveryResult = null;

    function setStatus(message, kind = 'info') {
        status.textContent = message;
        status.setAttribute('data-kind', kind);
    }

    function renderPlan(plan) {
        preview.replaceChildren();
        for (const source of plan.sources) {
            const section = node(documentObject, 'section', { className: 'vgen-nya-import-source' });
            section.append(node(
                documentObject,
                'h3',
                {},
                `${source.source.name} ${source.source.version} · Bridge ${source.bridgeVersion}`,
            ));
            section.append(node(documentObject, 'p', {}, `导出时间：${source.exportedAt}`));
            const table = node(documentObject, 'table');
            const head = node(documentObject, 'tr');
            for (const label of ['数据类别', '条目数量', '目标 key', '分析']) {
                head.append(node(documentObject, 'th', {}, label));
            }
            const thead = node(documentObject, 'thead');
            thead.append(head);
            const tbody = node(documentObject, 'tbody');
            for (const target of source.targets) {
                const row = node(documentObject, 'tr', { 'data-status': target.status });
                row.append(
                    node(documentObject, 'td', {}, target.label),
                    node(documentObject, 'td', {}, String(target.count)),
                    node(documentObject, 'td', {}, target.key),
                    node(documentObject, 'td', {}, statusText(target)),
                );
                tbody.append(row);
            }
            table.append(thead, tbody);
            section.append(table);
            preview.append(section);
        }
        if (plan.duplicateFilesIgnored) {
            preview.append(node(documentObject, 'p', {}, `已忽略 ${plan.duplicateFilesIgnored} 个完全相同的重复文件。`));
        }
        if (plan.hasConflicts) {
            setStatus('发现冲突：确认后仅迁移无冲突且缺失的新键；现有新值不会被覆盖。', 'warning');
        } else if (plan.alreadyMigrated) {
            setStatus('所选数据已经迁移过；确认不会产生重复内容。', 'success');
        } else {
            setStatus('预览完成。请核对来源、数量、目标 key 后再确认迁移。', 'success');
        }
        confirmButton.disabled = false;
    }

    async function prepareFiles(files) {
        pendingPlan = null;
        confirmButton.disabled = true;
        preview.replaceChildren();
        const selected = [...files];
        if (selected.length < 1 || selected.length > 2) {
            setStatus('请选择一个或两个 Legacy Export JSON 文件。', 'error');
            return null;
        }
        try {
            const texts = await Promise.all(selected.map((file) => file.text()));
            pendingPlan = await prepareLegacyImport(texts, store);
            renderPlan(pendingPlan);
            return pendingPlan;
        } catch (error) {
            setStatus(`拒绝导入：${error.message || error}`, 'error');
            return null;
        }
    }

    function confirmImport() {
        if (!pendingPlan) throw new Error('请先选择并预览 Legacy Export 文件');
        confirmButton.disabled = true;
        try {
            const result = commitLegacyImport(pendingPlan, store, { confirmed: true });
            pendingPlan = null;
            fileInput.value = '';
            setStatus(
                result.committed
                    ? `迁移完成：写入 ${result.writes.length} 个新键；跳过 ${result.skippedExisting.length} 个已迁移键和 ${result.skippedConflicts.length} 个冲突键。`
                    : `无需写入：跳过 ${result.skippedExisting.length} 个已迁移键和 ${result.skippedConflicts.length} 个冲突键。`,
                'success',
            );
            return result;
        } catch (error) {
            setStatus(`迁移失败：${error.message || error}`, 'error');
            throw error;
        }
    }

    function open() {
        if (!root) throw new Error('Legacy Import UI is not mounted');
        root.hidden = false;
    }

    function close() {
        if (root) root.hidden = true;
    }

    function mount() {
        if (!documentObject?.body || root) return false;
        recoveryResult = recoverPendingLegacyImport(store);
        const style = node(documentObject, 'style');
        style.textContent = `
#vgen-nya-legacy-import { position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);padding:5vh 5vw;overflow:auto;font:14px/1.45 system-ui;color:#222; }
#vgen-nya-legacy-import * { box-sizing:border-box; }
#vgen-nya-legacy-import .panel { max-width:980px;margin:auto;background:#fff;border-radius:12px;padding:20px;box-shadow:0 16px 60px #0005; }
#vgen-nya-legacy-import header { display:flex;justify-content:space-between;gap:16px;align-items:center; }
#vgen-nya-legacy-import table { width:100%;border-collapse:collapse;margin:8px 0 16px; }
#vgen-nya-legacy-import th,#vgen-nya-legacy-import td { padding:7px;border:1px solid #ddd;text-align:left;vertical-align:top; }
#vgen-nya-legacy-import tr[data-status="conflict"] { background:#fff0f0; }
#vgen-nya-legacy-import tr[data-status="already-migrated"] { background:#f1f8f1; }
#vgen-nya-legacy-import [data-kind="error"] { color:#a40000; }
#vgen-nya-legacy-import [data-kind="warning"] { color:#8a5200; }
#vgen-nya-legacy-import [data-kind="success"] { color:#176b2c; }
#vgen-nya-legacy-import .actions { display:flex;gap:8px;justify-content:flex-end;margin-top:16px; }
#vgen-nya-legacy-import button,#vgen-nya-legacy-import input { font:inherit; }
#vgen-nya-open-legacy-import { position:fixed;right:16px;bottom:108px;z-index:2147483646;padding:8px 12px;border:1px solid #246;border-radius:8px;background:#eaf3ff;color:#123;font:13px system-ui;cursor:pointer; }
`;
        root = node(documentObject, 'div', { id: 'vgen-nya-legacy-import', className: 'notranslate', translate: 'no' });
        root.hidden = true;
        const panel = node(documentObject, 'div', { className: 'panel' });
        const header = node(documentObject, 'header');
        header.append(
            node(documentObject, 'h2', {}, 'VGenToolNya 旧配置导入'),
            node(documentObject, 'button', { type: 'button', id: 'vgen-nya-import-close' }, '关闭'),
        );
        panel.append(header);
        panel.append(node(documentObject, 'p', {}, '选择一个或两个 Bridge 导出的 JSON。选择文件只生成预览，不会立即写入。'));
        fileInput = node(documentObject, 'input', {
            id: 'vgen-nya-legacy-files',
            type: 'file',
            accept: 'application/json,.json',
            multiple: '',
        });
        status = node(documentObject, 'p', { id: 'vgen-nya-import-status' });
        preview = node(documentObject, 'div', { id: 'vgen-nya-import-preview' });
        const actions = node(documentObject, 'div', { className: 'actions' });
        confirmButton = node(documentObject, 'button', { type: 'button', id: 'vgen-nya-import-confirm' }, '确认迁移');
        confirmButton.disabled = true;
        actions.append(confirmButton);
        panel.append(fileInput, status, preview, actions);
        root.append(style, panel);
        const opener = node(documentObject, 'button', { type: 'button', id: 'vgen-nya-open-legacy-import' }, '导入旧配置');
        documentObject.body.append(root, opener);
        opener.addEventListener('click', open);
        header.querySelector?.('#vgen-nya-import-close')?.addEventListener('click', close);
        root.addEventListener('click', (event) => { if (event.target === root) close(); });
        fileInput.addEventListener('change', () => void prepareFiles(fileInput.files));
        confirmButton.addEventListener('click', () => {
            try { confirmImport(); } catch (error) { console.error('[VGenToolNya Legacy Import]', error); }
        });
        if (recoveryResult.recovered) {
            setStatus(`已恢复上次中断的迁移事务（${recoveryResult.targets.length} 个目标键）。`, 'warning');
        } else {
            setStatus('尚未选择导出文件。', 'info');
        }
        return true;
    }

    function dispose() {
        documentObject.getElementById?.('vgen-nya-open-legacy-import')?.remove();
        root?.remove();
        root = null;
        pendingPlan = null;
    }

    return {
        mount,
        dispose,
        open,
        close,
        prepareFiles,
        confirmImport,
        get pendingPlan() { return pendingPlan; },
        get recoveryResult() { return recoveryResult; },
    };
}
