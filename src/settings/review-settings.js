import { REVIEW_LENGTHS, REVIEW_STAR_DEGREES, isReviewProviderConfigured, maskApiKey } from '../review/review-config.js';

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

function renderGeneration(repository) {
    return ({ documentObject, body, use }) => {
        const render = () => {
            const settings = repository.read().settings;
            const length = make(documentObject, 'select', { dataset: { setting: 'defaultLength' } });
            for (const option of REVIEW_LENGTHS) length.append(make(documentObject, 'option', { value: option }, option));
            length.value = settings.defaultLength;
            const star = make(documentObject, 'select', { dataset: { setting: 'defaultStarDegree' } });
            for (const degree of REVIEW_STAR_DEGREES) star.append(make(documentObject, 'option', { value: String(degree) }, `${degree} 星`));
            star.value = String(settings.defaultStarDegree);
            const row = make(documentObject, 'div', { className: 'vgen-nya-settings__check' });
            row.append(
                make(documentObject, 'label', {}, '默认长度 '), length,
                make(documentObject, 'label', {}, ' 默认星级倾向 '), star,
            );
            body.replaceChildren(
                make(documentObject, 'p', { className: 'vgen-nya-settings__hint' }, '生成评价时的默认参数。星级 1～5 表示「希望生成的评价倾向程度」，不是改写 VGen 的真实评分。'),
                row,
            );
        };
        const onChange = (event) => {
            const key = event.target?.dataset?.setting;
            if (!key) return;
            const settings = repository.read().settings;
            settings[key] = key === 'defaultStarDegree' ? Number(event.target.value) : event.target.value;
            repository.writeSettings(settings);
        };
        body.addEventListener('change', onChange);
        use(() => body.removeEventListener('change', onChange));
        render();
    };
}

function renderProvider(repository) {
    return ({ documentObject, body, use }) => {
        const render = () => {
            const provider = repository.read().provider;
            const configured = isReviewProviderConfigured(provider);
            const status = make(documentObject, 'p', { className: 'vgen-nya-settings__hint' },
                configured ? `已配置接口（API Key ${maskApiKey(provider.apiKey)}）` : '尚未配置接口。');
            const baseUrl = make(documentObject, 'input', { type: 'text', value: provider.baseUrl, placeholder: 'https://api.openai.com/v1', dataset: { setting: 'baseUrl' }, 'aria-label': 'Base URL' });
            const apiKey = make(documentObject, 'input', { type: 'password', value: provider.apiKey, placeholder: 'sk-…', dataset: { setting: 'apiKey' }, autocomplete: 'off', 'aria-label': 'API Key' });
            const model = make(documentObject, 'input', { type: 'text', value: provider.model, placeholder: 'gpt-4o-mini', dataset: { setting: 'model' }, 'aria-label': 'Model' });
            const systemPrompt = make(documentObject, 'textarea', { rows: 8, dataset: { setting: 'systemPrompt' }, 'aria-label': 'System Prompt' });
            systemPrompt.value = provider.systemPrompt;
            const field = (label, input) => {
                const row = make(documentObject, 'label', { className: 'vgen-nya-settings__check' });
                row.append(make(documentObject, 'span', {}, label), input);
                return row;
            };
            body.replaceChildren(
                status,
                field('Base URL（OpenAI Compatible）', baseUrl),
                field('API Key（仅本地保存，不明文常显）', apiKey),
                field('Model', model),
                field('System Prompt', systemPrompt),
            );
        };
        const onChange = (event) => {
            const key = event.target?.dataset?.setting;
            if (!key) return;
            const provider = repository.read().provider;
            provider[key] = event.target.value;
            repository.writeProvider(provider);
        };
        body.addEventListener('change', onChange);
        use(() => body.removeEventListener('change', onChange));
        render();
    };
}

export function createReviewSettingsNavigation({ repository }, baseNavigation) {
    return baseNavigation.map((item) => (item.id !== 'reviews' ? item : {
        ...item,
        tabs: [
            { id: 'generate', label: '生成', sections: [
                { id: 'generation', title: '生成参数', description: '关键词由业务页面按 session 输入；这里只设置默认长度与星级倾向。', render: renderGeneration(repository) },
            ] },
            { id: 'provider', label: '接口', sections: [
                { id: 'provider-config', title: '接口设置（OpenAI Compatible）', description: 'API Key 仅本地保存，不硬编码、不进入日志或诊断报告。', render: renderProvider(repository) },
            ] },
        ],
    }));
}
