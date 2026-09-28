import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';
import { renderTextPresetManager } from './text-preset-settings.js';

function make(documentObject, tag, attributes = {}, text = '') {
    const node = documentObject.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    node.textContent = text;
    return node;
}

function renderOrderTools(repository) {
    return ({ documentObject, body, use }) => {
        const render = () => {
            const settings = repository.read();
            const copy = make(documentObject, 'label', { className: 'vgen-nya-settings__check' });
            copy.append(make(documentObject, 'input', { type: 'checkbox', checked: settings.copyButtons, dataset: { setting: 'copyButtons' } }), documentObject.createTextNode(' 启用 Copy ID / Profile URL'));
            const background = make(documentObject, 'label', { className: 'vgen-nya-settings__check' });
            background.append(make(documentObject, 'input', { type: 'checkbox', checked: settings.clientBackground, dataset: { setting: 'clientBackground' } }), documentObject.createTextNode(' 启用 Client Background'));
            body.replaceChildren(copy, background);
        };
        const onChange = (event) => {
            const key = event.target?.dataset?.setting;
            if (!key) return;
            repository.write({ ...repository.read(), [key]: event.target.checked });
        };
        body.addEventListener('change', onChange);
        use(() => body.removeEventListener('change', onChange));
        render();
    };
}

export function createOrderSettingsNavigation({ engine, repository }, baseNavigation) {
    return baseNavigation.map((item) => item.id !== 'orders' ? item : {
        ...item,
        tabs: [
            {
                id: 'order-tools', label: '订单工具', sections: [
                    { id: 'client-background', title: 'Client Background', description: '公开客户身份、评价上下文与复制工具。', render: renderOrderTools(repository) },
                ],
            },
            {
                id: 'text-presets', label: '文本预设', sections: [
                { id: 'final-delivery', title: 'Final Delivery', description: '只填入，不交付。真实输入区等待安全订单状态验证。', render: renderTextPresetManager(engine, TEXT_PRESET_CONTEXTS.finalDelivery, { contentLabel: '交付文本' }) },
                { id: 'private-note', title: 'Private Note', description: '只填入 Note to self，不调用保存。', render: renderTextPresetManager(engine, TEXT_PRESET_CONTEXTS.privateNote, { contentLabel: 'Private Note' }) },
                ],
            },
        ],
    });
}

export function createOrderTextPresetNavigation(engine, baseNavigation) {
    return createOrderSettingsNavigation({ engine, repository: { read: () => ({ copyButtons: true, clientBackground: true }), write() {} } }, baseNavigation);
}
