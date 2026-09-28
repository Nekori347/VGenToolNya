const DOMAIN_LABELS = Object.freeze({
    combinationPresets: '组合预设',
    titlePresets: '标题预设',
    descriptionPresets: '描述预设',
    discoveryPresets: '发现标签预设',
    searchTagGroups: '搜索标签分类',
});
import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';
import { renderTextPresetManager } from './text-preset-settings.js';
import { setButtonIcon } from '../ui/icons.js';

function make(documentObject, tag, attributes = {}, text = '') {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
}

function reorderButton(documentObject, action, index, disabled) {
    const button = make(documentObject, 'button', { type: 'button', dataset: { action, index }, disabled });
    setButtonIcon(button, action === 'up' ? 'arrowUp' : 'arrowDown', { label: action === 'up' ? '上移' : '下移' });
    return button;
}

function renderPresetManager(repository, domain) {
    return ({ documentObject, body, use }) => {
        const render = () => {
            const data = repository.read()[domain];
            body.replaceChildren();
            const toolbar = make(documentObject, 'div', { className: 'vgen-nya-settings__toolbar' });
            toolbar.append(make(documentObject, 'span', {}, `${data.length} 项；顺序即 Upload Assistant 显示顺序。`));
            body.append(toolbar);
            data.forEach((preset, index) => {
                const row = make(documentObject, 'div', { className: 'vgen-nya-settings__preset-row' });
                row.append(
                    make(documentObject, 'span', {}, preset.name || preset.tag || `未命名 ${index + 1}`),
                    reorderButton(documentObject, 'up', index, index === 0),
                    reorderButton(documentObject, 'down', index, index === data.length - 1),
                    make(documentObject, 'button', { type: 'button', dataset: { action: 'delete', index } }, '删除'),
                );
                body.append(row);
            });
            const editor = make(documentObject, 'details');
            const summary = make(documentObject, 'summary', {}, '高级 JSON 编辑（保留原字段）');
            const textarea = make(documentObject, 'textarea', { rows: 10, value: JSON.stringify(data, null, 2), dataset: { role: 'json' } });
            textarea.style.width = '100%';
            const save = make(documentObject, 'button', { type: 'button', dataset: { action: 'save-json' } }, '校验并保存');
            editor.append(summary, textarea, save);
            body.append(editor);
        };
        const onClick = (event) => {
            const button = event.target?.closest?.('button[data-action]');
            if (!button) return;
            const data = repository.read()[domain];
            if (button.dataset.action === 'save-json') {
                const parsed = JSON.parse(body.querySelector('textarea[data-role]')?.value || '[]');
                repository.writeDomain(domain, parsed);
                render();
                return;
            }
            const index = Number(button.dataset.index);
            if (button.dataset.action === 'delete') data.splice(index, 1);
            else {
                const other = button.dataset.action === 'up' ? index - 1 : index + 1;
                if (other < 0 || other >= data.length) return;
                [data[index], data[other]] = [data[other], data[index]];
            }
            repository.writeDomain(domain, data);
            render();
        };
        body.addEventListener('click', onClick);
        use(() => body.removeEventListener('click', onClick));
        render();
    };
}

function renderInterface(repository) {
    return ({ documentObject, body, use }) => {
        const snapshot = repository.read();
        const settings = snapshot.uploadSettings;
        body.replaceChildren();
        const labels = { global: '组合预设', title: '标题', description: '描述', discovery: '发现标签', tags: '搜索标签' };
        for (const [key, label] of Object.entries(labels)) {
            const row = make(documentObject, 'label', { className: 'vgen-nya-settings__check' });
            row.append(make(documentObject, 'input', { type: 'checkbox', checked: settings.modules[key], dataset: { module: key } }), documentObject.createTextNode(` ${label}`));
            body.append(row);
        }
        const collapse = make(documentObject, 'label', { className: 'vgen-nya-settings__check' });
        collapse.append(make(documentObject, 'input', { type: 'checkbox', checked: settings.autoCollapseDiscovery, dataset: { setting: 'autoCollapseDiscovery' } }), documentObject.createTextNode(' 应用后自动折叠发现标签'));
        const theme = make(documentObject, 'select', { dataset: { setting: 'theme' } });
        theme.append(make(documentObject, 'option', { value: 'light', selected: snapshot.uiSettings.theme === 'light' }, '浅色'), make(documentObject, 'option', { value: 'dark', selected: snapshot.uiSettings.theme === 'dark' }, '深色'));
        const refresh = make(documentObject, 'button', { type: 'button', dataset: { action: 'refresh' } }, '刷新 Upload 配置');
        const exportButton = make(documentObject, 'button', { type: 'button', dataset: { action: 'export' } }, '导出日常预设');
        const importInput = make(documentObject, 'input', { type: 'file', accept: 'application/json,.json', dataset: { action: 'import' } });
        body.append(collapse, make(documentObject, 'div', {}, '主题：'), theme, refresh, exportButton, importInput);
        const onChange = async (event) => {
            if (event.target.dataset.module) { const next = repository.read().uploadSettings; next.modules[event.target.dataset.module] = event.target.checked; repository.writeSettings(next); }
            else if (event.target.dataset.setting === 'autoCollapseDiscovery') { const next = repository.read().uploadSettings; next.autoCollapseDiscovery = event.target.checked; repository.writeSettings(next); }
            else if (event.target.dataset.setting === 'theme') repository.writeUiSettings({ theme: event.target.value });
            else if (event.target.dataset.action === 'import' && event.target.files?.[0]) {
                const plan = repository.prepareDailyImport(await event.target.files[0].text());
                const summary = Object.entries(plan.counts).map(([key, count]) => `${key}: ${count}`).join('\n');
                if (documentObject.defaultView?.confirm?.(`将覆盖当前 Upload 预设：\n${summary}\n继续吗？`)) {
                    repository.commitDailyImport(plan, { confirmed: true });
                }
                event.target.value = '';
            }
        };
        const onClick = (event) => {
            if (event.target.dataset.action === 'refresh') repository.refresh();
            if (event.target.dataset.action === 'export') {
                const blob = new Blob([JSON.stringify(repository.exportDaily(), null, 2)], { type: 'application/json;charset=utf-8' });
                const view = documentObject.defaultView || globalThis;
                const url = view.URL.createObjectURL(blob);
                const anchor = make(documentObject, 'a', { href: url, download: `vgen-nya-upload-presets-${new Date().toISOString().slice(0, 10)}.json` });
                body.append(anchor); anchor.click(); anchor.remove(); view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
            }
        };
        body.addEventListener('change', onChange); body.addEventListener('click', onClick);
        use(() => body.removeEventListener('change', onChange)); use(() => body.removeEventListener('click', onClick));
    };
}

export function createUploadSettingsNavigation(repository, baseNavigation, textPresetEngine = null) {
    return baseNavigation.map((item) => item.id !== 'upload' ? item : {
        ...item,
        tabs: [
            { id: 'combination', label: '组合预设', sections: [{ id: 'combination', title: DOMAIN_LABELS.combinationPresets, render: renderPresetManager(repository, 'combinationPresets') }] },
            { id: 'text', label: '标题 / 描述', sections: [
                { id: 'title', title: DOMAIN_LABELS.titlePresets, render: textPresetEngine ? renderTextPresetManager(textPresetEngine, TEXT_PRESET_CONTEXTS.uploadTitle, { contentLabel: '标题内容' }) : renderPresetManager(repository, 'titlePresets') },
                { id: 'description', title: DOMAIN_LABELS.descriptionPresets, render: textPresetEngine ? renderTextPresetManager(textPresetEngine, TEXT_PRESET_CONTEXTS.uploadDescription, { contentLabel: 'Slate JSON' }) : renderPresetManager(repository, 'descriptionPresets') },
            ] },
            { id: 'discovery', label: '发现标签', sections: [{ id: 'discovery', title: DOMAIN_LABELS.discoveryPresets, render: renderPresetManager(repository, 'discoveryPresets') }] },
            { id: 'search-tags', label: '搜索标签', sections: [{ id: 'search-tags', title: DOMAIN_LABELS.searchTagGroups, render: renderPresetManager(repository, 'searchTagGroups') }] },
            { id: 'interface', label: '界面设置', sections: [{ id: 'interface', title: '模块与显示', render: renderInterface(repository) }] },
        ],
    });
}
