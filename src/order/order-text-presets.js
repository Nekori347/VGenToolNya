import { TEXT_PRESET_CONTEXTS } from '../presets/context-registry.js';
import { NativeTextTarget } from '../presets/native-text-target.js';

const NOTE_CONTEXT = TEXT_PRESET_CONTEXTS.privateNote;
const NOTE_SELECTOR = 'textarea[aria-label="Note to self"], input[aria-label="Note to self"], textarea[placeholder="Note to self"], input[placeholder="Note to self"]';
const ORDER_PRESET_CSS = '.vgen-nya-order-presets{display:flex;align-items:center;gap:6px;max-width:100%;padding:6px 2px;overflow-x:auto}.vgen-nya-order-presets .vgen-nya-preset-chip{flex:0 0 auto;max-width:220px;padding:5px 9px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:8px;background:color-mix(in srgb,currentColor 7%,transparent);color:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}.vgen-nya-order-presets .vgen-nya-preset-chip:hover{background:color-mix(in srgb,currentColor 13%,transparent)}.vgen-nya-order-presets .vgen-nya-preset-empty{font:12px/1.4 system-ui,sans-serif;opacity:.62}';

function privateNoteInputs(root) {
    const inputs = [
        ...(root?.matches?.(NOTE_SELECTOR) ? [root] : []),
        ...(root?.querySelectorAll?.(NOTE_SELECTOR) || []),
    ];
    for (const label of root?.querySelectorAll?.('label') || []) {
        if (!/\bnote\s+to\s+self\b/i.test(String(label.textContent || ''))) continue;
        const id = label.getAttribute?.('for') || label.htmlFor;
        const input = (id && label.ownerDocument?.getElementById?.(id)) || label.querySelector?.('textarea, input') || label.parentElement?.querySelector?.('textarea, input');
        if (input) inputs.push(input);
    }
    return [...new Set(inputs)];
}

class PrivateNoteTarget {
    constructor(element) { this.native = new NativeTextTarget(element); }
    fillPrivateNote(payload, options) { return this.native.fillText(payload, options); }
}

class PrivateNoteSession {
    constructor({ input, engine } = {}) {
        this.input = input;
        this.engine = engine;
        this.root = null;
        this.target = new PrivateNoteTarget(input);
        this.onClick = (event) => this.#click(event);
        this.onInput = () => { this.engine.clearSelection(NOTE_CONTEXT); this.render(); };
    }

    mount() {
        if (this.root?.isConnected) return false;
        const documentObject = this.input.ownerDocument;
        this.root = documentObject.createElement('div');
        this.root.className = 'vgen-nya-order-presets notranslate';
        this.root.dataset.vgenNyaUi = 'private-note-presets';
        this.root.translate = false;
        this.root.addEventListener('click', this.onClick);
        this.input.addEventListener('input', this.onInput);
        (this.input.parentElement || this.input).append(this.root);
        this.render();
        return true;
    }

    render() {
        const documentObject = this.input.ownerDocument;
        this.root.replaceChildren();
        const items = this.engine.list(NOTE_CONTEXT);
        if (!items.length) {
            const empty = documentObject.createElement('span'); empty.className = 'vgen-nya-preset-empty'; empty.textContent = '暂无 Private Note 预设'; this.root.append(empty); return;
        }
        for (const preset of items) {
            const button = documentObject.createElement('button'); button.type = 'button'; button.className = 'vgen-nya-preset-chip';
            button.dataset.presetId = preset.id; button.title = this.engine.preview(NOTE_CONTEXT, preset.id, 180); button.textContent = preset.name;
            button.setAttribute('aria-pressed', String(this.engine.selectedId(NOTE_CONTEXT) === String(preset.id)));
            this.root.append(button);
        }
    }

    async #click(event) {
        const button = event.target?.closest?.('button[data-preset-id]');
        if (!button || !this.root.contains(button)) return;
        let result = await this.engine.select(NOTE_CONTEXT, button.dataset.presetId, this.target);
        if (result.status === 'requires-confirmation') {
            if (this.root.ownerDocument.defaultView?.confirm?.('Note 已有内容。确认替换吗？') !== true) return;
            result = await this.engine.select(NOTE_CONTEXT, button.dataset.presetId, this.target, { replace: true });
        }
        if (result.status === 'filled') this.render();
    }

    unmount() {
        this.root?.removeEventListener('click', this.onClick);
        this.input?.removeEventListener('input', this.onInput);
        this.root?.remove();
        this.root = null;
    }
}

export class OrderTextPresetRuntime {
    constructor({ engine, documentObject = globalThis.document, MutationObserverClass = globalThis.MutationObserver, noteResolver = privateNoteInputs } = {}) {
        this.engine = engine;
        this.documentObject = documentObject;
        this.MutationObserverClass = MutationObserverClass;
        this.noteResolver = noteResolver;
        this.sessions = new Map();
        this.observer = null;
        this.unsubscribe = null;
        this.style = null;
        this.mounted = false;
    }

    mount() {
        if (this.mounted || !this.documentObject?.body) return false;
        this.mounted = true;
        this.style = this.documentObject.createElement('style');
        this.style.dataset.vgenNyaUi = 'order-preset-style';
        this.style.textContent = ORDER_PRESET_CSS;
        (this.documentObject.head || this.documentObject.body).append(this.style);
        this.scan(this.documentObject);
        this.unsubscribe = this.engine.subscribe(({ context }) => {
            if (context === NOTE_CONTEXT) for (const session of this.sessions.values()) session.render();
        });
        if (this.MutationObserverClass) {
            this.observer = new this.MutationObserverClass((records) => {
                for (const record of records) {
                    for (const node of record.addedNodes || []) this.scan(node);
                    for (const node of record.removedNodes || []) this.releaseRemoved(node);
                }
            });
            this.observer.observe(this.documentObject.body, { childList: true });
        }
        return true;
    }

    scan(root) {
        let mounted = 0;
        for (const input of this.noteResolver(root)) {
            if (this.sessions.has(input) || input.isConnected === false) continue;
            const session = new PrivateNoteSession({ input, engine: this.engine });
            session.mount(); this.sessions.set(input, session); mounted += 1;
        }
        return mounted;
    }

    releaseRemoved(root) {
        for (const [input, session] of this.sessions) {
            if (input === root || root.contains?.(input) || !input.isConnected) { session.unmount(); this.sessions.delete(input); }
        }
    }

    activate() {}
    unmount() { if (!this.mounted) return false; this.observer?.disconnect(); this.observer = null; this.unsubscribe?.(); this.unsubscribe = null; for (const session of this.sessions.values()) session.unmount(); this.sessions.clear(); this.style?.remove(); this.style = null; this.mounted = false; return true; }
    dispose() { this.unmount(); }
}

export class FinalDeliveryTarget {
    constructor(element) { this.native = new NativeTextTarget(element); }
    fillFinalDelivery(payload, options) { return this.native.fillText(payload, options); }
}
