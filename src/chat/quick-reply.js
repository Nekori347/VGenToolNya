import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';

const CONTEXT = TEXT_PRESET_CONTEXTS.chatQuickReply;

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

export class QuickReplyController {
    constructor({ engine, adapter } = {}) {
        this.engine = engine;
        this.adapter = adapter;
        this.root = null;
        this.composer = null;
        this.onInput = () => { this.engine.clearSelection(CONTEXT); this.render(); };
        this.onClick = (event) => this.#click(event);
        this.unsubscribe = null;
    }

    refresh() {
        if (!this.engine) return false;
        const composer = this.adapter.findComposer?.();
        if (!composer) { this.cleanup(); return false; }
        if (composer !== this.composer) {
            this.cleanup();
            this.composer = composer;
            const documentObject = composer.ownerDocument;
            this.root = make(documentObject, 'div', {
                className: 'vgen-nya-quick-replies notranslate',
                dataset: { vgenNyaUi: 'quick-replies' },
                translate: false,
            });
            this.root.addEventListener('click', this.onClick);
            this.composer.addEventListener('input', this.onInput);
            this.unsubscribe = this.engine.subscribe(({ context }) => { if (context === CONTEXT) this.render(); });
            const anchor = composer.closest?.('.str-chat__message-input, [class*="MessageInput"]') || composer.parentElement;
            (anchor || composer).append(this.root);
        }
        this.render();
        return true;
    }

    render() {
        if (!this.root) return;
        const documentObject = this.root.ownerDocument;
        const selected = this.engine.selectedId(CONTEXT);
        const items = this.engine.list(CONTEXT);
        this.root.replaceChildren();
        if (!items.length) {
            this.root.append(make(documentObject, 'span', { className: 'vgen-nya-preset-empty' }, '暂无快捷回复'));
            return;
        }
        for (const preset of items) {
            this.root.append(make(documentObject, 'button', {
                type: 'button', className: 'vgen-nya-preset-chip', dataset: { presetId: preset.id },
                title: this.engine.preview(CONTEXT, preset.id, 180),
                'aria-pressed': String(selected === String(preset.id)),
            }, preset.name));
        }
    }

    ownsMutation(record) { return Boolean(this.root && (record.target === this.root || this.root.contains?.(record.target))); }

    async #click(event) {
        const button = event.target?.closest?.('button[data-preset-id]');
        if (!button || !this.root?.contains(button)) return;
        let result = await this.engine.select(CONTEXT, button.dataset.presetId, this.adapter);
        if (result.status === 'requires-confirmation') {
            const confirmed = this.root.ownerDocument.defaultView?.confirm?.('Composer 已有内容。确认替换为该快捷回复吗？') === true;
            if (!confirmed) return;
            result = await this.engine.select(CONTEXT, button.dataset.presetId, this.adapter, { replace: true });
        }
        if (result.status === 'filled') this.render();
    }

    cleanup() {
        this.composer?.removeEventListener('input', this.onInput);
        this.root?.removeEventListener('click', this.onClick);
        this.root?.remove();
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.root = null;
        this.composer = null;
    }
}
