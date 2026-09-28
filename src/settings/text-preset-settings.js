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

export function renderTextPresetManager(engine, context, { contentLabel = '内容' } = {}) {
    return ({ documentObject, body, use }) => {
        let dragIndex = null;
        const status = make(documentObject, 'p', { className: 'vgen-nya-settings__preset-status', dataset: { role: 'status' } });
        const render = () => {
            const items = engine.list(context);
            body.replaceChildren(make(documentObject, 'p', { className: 'vgen-nya-settings__hint' }, `${items.length} 项 · 可拖动或使用箭头排序；点击业务页面预设只填入，不提交。`));
            for (const [index, preset] of items.entries()) {
                const row = make(documentObject, 'div', { className: 'vgen-nya-settings__preset-editor', dataset: { index }, draggable: true });
                const name = make(documentObject, 'input', { value: preset.name, dataset: { role: 'name' }, 'aria-label': '预设名称' });
                name.value = preset.name;
                const content = make(documentObject, 'textarea', { rows: 2, dataset: { role: 'content' }, 'aria-label': contentLabel });
                content.value = engine.registry.get(context).deserialize(preset);
                const preview = make(documentObject, 'span', { className: 'vgen-nya-settings__preset-preview', title: engine.preview(context, preset.id, 500) }, engine.preview(context, preset.id, 100) || '（空内容）');
                row.append(name, content, preview,
                    make(documentObject, 'button', { type: 'button', dataset: { action: 'save', id: preset.id } }, '保存'),
                    reorderButton(documentObject, 'up', index, index === 0),
                    reorderButton(documentObject, 'down', index, index === items.length - 1),
                    make(documentObject, 'button', { type: 'button', dataset: { action: 'delete', id: preset.id } }, '删除'));
                body.append(row);
            }
            const add = make(documentObject, 'div', { className: 'vgen-nya-settings__preset-add' });
            const newName = make(documentObject, 'input', { placeholder: '新预设名称', dataset: { role: 'new-name' } });
            const newContent = make(documentObject, 'textarea', { rows: 2, placeholder: contentLabel, dataset: { role: 'new-content' } });
            add.append(newName, newContent, make(documentObject, 'button', { type: 'button', dataset: { action: 'add' } }, '新建'));
            body.append(add, status);
        };
        const show = (message, error = false) => { const node = body.querySelector('[data-role="status"]'); if (node) { node.textContent = message; node.dataset.error = String(error); } };
        const onClick = (event) => {
            const button = event.target?.closest?.('button[data-action]');
            if (!button || !body.contains(button)) return;
            try {
                const action = button.dataset.action;
                if (action === 'add') {
                    const name = body.querySelector('[data-role="new-name"]')?.value || '';
                    const payload = body.querySelector('[data-role="new-content"]')?.value || '';
                    engine.create(context, { name, payload });
                } else if (action === 'save') {
                    const row = button.closest('.vgen-nya-settings__preset-editor');
                    engine.update(context, button.dataset.id, { name: row.querySelector('[data-role="name"]')?.value, payload: row.querySelector('[data-role="content"]')?.value });
                } else if (action === 'delete') engine.delete(context, button.dataset.id);
                else {
                    const from = Number(button.dataset.index);
                    engine.reorder(context, from, action === 'up' ? from - 1 : from + 1);
                }
                render(); show('已保存');
            } catch (error) { show(error.message || '保存失败', true); }
        };
        const onDragStart = (event) => { dragIndex = Number(event.target?.closest?.('[data-index]')?.dataset.index); };
        const onDragOver = (event) => { if (event.target?.closest?.('[data-index]')) event.preventDefault(); };
        const onDrop = (event) => {
            const to = Number(event.target?.closest?.('[data-index]')?.dataset.index);
            if (Number.isInteger(dragIndex) && Number.isInteger(to) && dragIndex !== to) { engine.reorder(context, dragIndex, to); render(); }
            dragIndex = null;
        };
        body.addEventListener('click', onClick); body.addEventListener('dragstart', onDragStart); body.addEventListener('dragover', onDragOver); body.addEventListener('drop', onDrop);
        use(() => body.removeEventListener('click', onClick)); use(() => body.removeEventListener('dragstart', onDragStart)); use(() => body.removeEventListener('dragover', onDragOver)); use(() => body.removeEventListener('drop', onDrop));
        render();
    };
}
