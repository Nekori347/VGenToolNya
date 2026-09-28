function make(documentObject, tag, attributes = {}, text = '') {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    if (text) node.textContent = text;
    return node;
}

function check(documentObject, label, checked, setting) {
    const row = make(documentObject, 'label', { className: 'vgen-nya-settings__check' });
    row.append(make(documentObject, 'input', { type: 'checkbox', checked, dataset: { setting } }), documentObject.createTextNode(` ${label}`));
    return row;
}

function renderChat(repository, fields) {
    return ({ documentObject, body, use }) => {
        const render = () => {
            const settings = repository.read().chatSettings;
            body.replaceChildren(...fields.map(([key, label]) => check(documentObject, label, settings[key], key)));
        };
        const onChange = (event) => {
            const key = event.target?.dataset?.setting;
            if (!key) return;
            const settings = repository.read().chatSettings;
            settings[key] = event.target.checked;
            repository.writeChatSettings(settings);
        };
        body.addEventListener('change', onChange);
        use(() => body.removeEventListener('change', onChange));
        render();
    };
}

function renderClientPanel(repository) {
    return ({ documentObject, body, use }) => {
        const render = () => {
            const settings = repository.read().clientsSettings;
            body.replaceChildren(
                check(documentObject, '启用常用访问面板', settings.enabled, 'enabled'),
                check(documentObject, '默认折叠', settings.collapsed, 'collapsed'),
                make(documentObject, 'label', {}, '面板最小高度 '),
                make(documentObject, 'input', { type: 'number', min: 120, max: 520, value: settings.minHeight, dataset: { setting: 'minHeight' } }),
                make(documentObject, 'label', {}, ' 行高 '),
                make(documentObject, 'input', { type: 'number', min: 42, max: 88, value: settings.rowHeight, dataset: { setting: 'rowHeight' } }),
            );
        };
        const onChange = (event) => {
            const key = event.target?.dataset?.setting;
            if (!key) return;
            const settings = repository.read().clientsSettings;
            settings[key] = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
            repository.writeClientsSettings(settings);
        };
        body.addEventListener('change', onChange);
        use(() => body.removeEventListener('change', onChange));
        render();
    };
}

function renderClientManager(repository) {
    return ({ documentObject, body, use }) => {
        const render = () => {
            body.replaceChildren();
            repository.read().clients.forEach((client, index, clients) => {
                const row = make(documentObject, 'div', { className: 'vgen-nya-settings__preset-row' });
                const note = make(documentObject, 'input', { value: client.note, placeholder: `@${client.username}`, dataset: { role: 'note', id: client.id } });
                row.append(
                    note,
                    make(documentObject, 'button', { type: 'button', disabled: index === 0, dataset: { action: 'up', index } }, '↑'),
                    make(documentObject, 'button', { type: 'button', disabled: index === clients.length - 1, dataset: { action: 'down', index } }, '↓'),
                    make(documentObject, 'button', { type: 'button', dataset: { action: 'delete', id: client.id } }, '删除'),
                );
                body.append(row);
            });
            const add = make(documentObject, 'div', { className: 'vgen-nya-settings__toolbar' });
            add.append(
                make(documentObject, 'input', { placeholder: 'VGen username', dataset: { role: 'username' } }),
                make(documentObject, 'input', { placeholder: '备注（可选）', dataset: { role: 'new-note' } }),
                make(documentObject, 'button', { type: 'button', dataset: { action: 'add' } }, '添加'),
            );
            body.append(add);
        };
        const onChange = (event) => {
            if (event.target?.dataset?.role !== 'note') return;
            const clients = repository.read().clients;
            const client = clients.find((item) => item.id === event.target.dataset.id);
            if (client) { client.note = event.target.value; repository.writeClients(clients); }
        };
        const onClick = (event) => {
            const button = event.target?.closest?.('button[data-action]');
            if (!button) return;
            if (button.dataset.action === 'delete') repository.removeClient(button.dataset.id);
            if (button.dataset.action === 'up' || button.dataset.action === 'down') {
                const index = Number(button.dataset.index);
                repository.reorderClient(index, button.dataset.action === 'up' ? index - 1 : index + 1);
            }
            if (button.dataset.action === 'add') {
                const username = String(body.querySelector('[data-role="username"]')?.value || '').trim().replace(/^@/, '');
                const note = String(body.querySelector('[data-role="new-note"]')?.value || '').trim();
                if (!/^[A-Za-z0-9_.-]+$/.test(username)) throw new TypeError('Invalid VGen username');
                const clients = repository.read().clients;
                clients.push({ id: globalThis.crypto?.randomUUID?.() || `client-${Date.now()}`, username, note, createdAt: Date.now() });
                repository.writeClients(clients);
            }
            render();
        };
        body.addEventListener('change', onChange);
        body.addEventListener('click', onClick);
        use(() => body.removeEventListener('change', onChange));
        use(() => body.removeEventListener('click', onClick));
        render();
    };
}

function renderDiagnostics(diagnostics) {
    return ({ documentObject, body, use }) => {
        const status = make(documentObject, 'p');
        const render = () => { status.textContent = diagnostics.active ? `运行中 · ${diagnostics.events.length} events` : '已停止；无诊断网络 hook'; };
        const start = make(documentObject, 'button', { type: 'button', dataset: { action: 'start' } }, '启动诊断');
        const stop = make(documentObject, 'button', { type: 'button', dataset: { action: 'stop' } }, '停止诊断');
        const exportButton = make(documentObject, 'button', { type: 'button', dataset: { action: 'export' } }, '导出报告');
        body.replaceChildren(status, start, stop, exportButton);
        const onClick = (event) => {
            const action = event.target?.dataset?.action;
            if (action === 'start') diagnostics.start();
            if (action === 'stop') diagnostics.stop();
            if (action === 'export') {
                const blob = new Blob([JSON.stringify(diagnostics.snapshot(), null, 2)], { type: 'application/json;charset=utf-8' });
                const view = documentObject.defaultView || globalThis;
                const url = view.URL.createObjectURL(blob);
                const anchor = make(documentObject, 'a', { href: url, download: `vgen-nya-chat-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json` });
                body.append(anchor); anchor.click(); anchor.remove(); view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
            }
            render();
        };
        body.addEventListener('click', onClick);
        use(() => body.removeEventListener('click', onClick));
        render();
    };
}

export function createChatSettingsNavigation(repository, diagnostics, baseNavigation, textPresetEngine = null) {
    return baseNavigation.map((item) => {
        if (item.id === 'chat') return {
            ...item,
            tabs: [
                { id: 'display', label: '聊天显示', sections: [{ id: 'display', title: 'Seen / 时间戳 / Reaction / 搜索', render: renderChat(repository, [
                    ['enabled', '启用 Chat Assistant'], ['showSeen', '显示 seen'], ['showTimestamps', '显示时间戳'], ['showStatusBar', '显示气泡状态长条'], ['compactReactions', '紧凑 Reaction'], ['searchEnabled', '启用聊天全文搜索'],
                ]) }] },
                { id: 'read-control', label: '已读控制', sections: [{ id: 'read-control', title: '服务器已读边界', render: renderChat(repository, [
                    ['keepUnread', '保持服务器未读，手动释放'], ['reactionMarkRead', 'Reaction 成功后标记已读'],
                ]) }] },
                ...(textPresetEngine ? [{ id: 'quick-reply', label: '快捷回复', sections: [{ id: 'quick-reply', title: 'Chat Quick Reply', render: renderTextPresetManager(textPresetEngine, TEXT_PRESET_CONTEXTS.chatQuickReply, { contentLabel: '回复内容' }) }] }] : []),
            ],
        };
        if (item.id === 'clients') return {
            ...item,
            tabs: [
                { id: 'panel', label: '面板设置', sections: [{ id: 'panel', title: '显示与尺寸', render: renderClientPanel(repository) }] },
                { id: 'management', label: '客户管理', sections: [{ id: 'management', title: '新增 / 备注 / 排序 / 删除', render: renderClientManager(repository) }] },
            ],
        };
        if (item.id === 'developer') return {
            ...item,
            tabs: [{ id: 'diagnostics', label: 'Diagnostics', sections: [{ id: 'diagnostics', title: 'Chat 网络诊断', render: renderDiagnostics(diagnostics) }] }],
        };
        return item;
    });
}
import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';
import { renderTextPresetManager } from './text-preset-settings.js';
